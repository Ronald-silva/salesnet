jest.mock('../../agent/memory', () => ({
  isHumanMode: jest.fn(),
  getThread:   jest.fn(),
  saveMessage: jest.fn(),
}));

jest.mock('../../agent/tools', () => ({
  TOOL_DEFINITIONS: [],
  executeTool: jest.fn(),
}));

jest.mock('../../agent/prompt', () => ({
  SYSTEM_PROMPT: 'test-prompt',
}));

jest.mock('../../config/anthropic', () => ({
  anthropic: { messages: { create: jest.fn() } },
}));

jest.mock('../../config/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

jest.mock('../../integrations/twilio/sender', () => ({
  sendMessage: jest.fn(),
}));

import { processMessage } from '../../agent/processor';
import { isHumanMode, getThread, saveMessage } from '../../agent/memory';
import { executeTool } from '../../agent/tools';
import { anthropic } from '../../config/anthropic';
import { sendMessage } from '../../integrations/twilio/sender';

const PHONE = '+5585999990000';
const THREAD = {
  id: 'uuid-1',
  phone: PHONE,
  messages: [{ role: 'user', content: 'Oi', timestamp: '2026-01-01T00:00:00Z' }],
  human_mode: false,
  churn_risk: false,
};
const CUSTOMER = { id: 'c1', name: 'João Silva', status: 'active' };
const TEXT_RESPONSE = {
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: 'Olá João! Posso ajudar?' }],
};

describe('processMessage — human_mode ON', () => {
  it('returns early without calling Claude when human_mode is true', async () => {
    (isHumanMode as jest.Mock).mockResolvedValue(true);

    await processMessage(PHONE, 'Oi');

    expect(anthropic.messages.create).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('processMessage — normal flow', () => {
  beforeEach(() => {
    (isHumanMode as jest.Mock).mockResolvedValue(false);
    (saveMessage as jest.Mock).mockResolvedValue(undefined);
    (getThread as jest.Mock).mockResolvedValue(THREAD);
    (executeTool as jest.Mock).mockResolvedValue(CUSTOMER);
    (anthropic.messages.create as jest.Mock).mockResolvedValue(TEXT_RESPONSE);
    (sendMessage as jest.Mock).mockResolvedValue(undefined);
  });

  it('saves user message before calling Claude', async () => {
    await processMessage(PHONE, 'Quero ver minha fatura');
    expect(saveMessage).toHaveBeenCalledWith(PHONE, 'user', 'Quero ver minha fatura');
  });

  it('calls executeTool buscar_cliente with phone before Claude', async () => {
    await processMessage(PHONE, 'Oi');
    expect(executeTool).toHaveBeenCalledWith('buscar_cliente', { phone: PHONE }, PHONE);
  });

  it('sends Claude response via Twilio', async () => {
    await processMessage(PHONE, 'Oi');
    expect(sendMessage).toHaveBeenCalledWith(PHONE, 'Olá João! Posso ajudar?');
  });

  it('saves assistant response to thread', async () => {
    await processMessage(PHONE, 'Oi');
    expect(saveMessage).toHaveBeenCalledWith(PHONE, 'assistant', 'Olá João! Posso ajudar?');
  });
});

describe('processMessage — tool use loop', () => {
  it('executes requested tools and gets final response', async () => {
    (isHumanMode as jest.Mock).mockResolvedValue(false);
    (saveMessage as jest.Mock).mockResolvedValue(undefined);
    (getThread as jest.Mock).mockResolvedValue(THREAD);
    (sendMessage as jest.Mock).mockResolvedValue(undefined);

    // buscar_cliente returns customer; get_fatura_atual returns invoice
    (executeTool as jest.Mock)
      .mockResolvedValueOnce(CUSTOMER)
      .mockResolvedValueOnce({ id: 'inv-1', amount: 90, status: 'open' });

    const toolUseResponse = {
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_001',
          name: 'get_fatura_atual',
          input: { customer_id: 'c1' },
        },
      ],
    };
    const finalResponse = {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Sua fatura é R$90.' }],
    };

    (anthropic.messages.create as jest.Mock)
      .mockResolvedValueOnce(toolUseResponse)
      .mockResolvedValueOnce(finalResponse);

    await processMessage(PHONE, 'Qual minha fatura?');

    expect(executeTool).toHaveBeenCalledWith('get_fatura_atual', { customer_id: 'c1' }, PHONE);
    expect(sendMessage).toHaveBeenCalledWith(PHONE, 'Sua fatura é R$90.');
  });
});
