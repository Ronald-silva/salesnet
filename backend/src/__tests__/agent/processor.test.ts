jest.mock('../../config/env', () => ({
  env: {
    LLM_ROUTING_MODE:           'single',
    LLM_PROVIDER:               'anthropic',
    LLM_FALLBACK_PROVIDER:      undefined,
    ANTHROPIC_API_KEY:          'test-key',
    DEEPSEEK_API_KEY:           undefined,
    DEEPSEEK_BASE_URL:          'https://api.deepseek.com',
    ANTHROPIC_MODEL:            'claude-test',
    DEEPSEEK_MODEL:             'deepseek-chat',
    LLM_MAX_TOKENS:             1024,
    LLM_SIMPLE_MAX_TOKENS:      512,
    LLM_SIMPLE_MAX_TOOL_ROUNDS: 3,
    TWILIO_ACCOUNT_SID:         'x',
    TWILIO_AUTH_TOKEN:          'x',
    TWILIO_WHATSAPP_NUMBER:     'x',
    SGP_BASE_URL:               'https://example.com',
    SGP_API_TOKEN:              'x',
    SUPABASE_URL:               'https://example.com',
    SUPABASE_SERVICE_ROLE_KEY:  'x',
    PORT:                       3001,
    NODE_ENV:                   'test',
    DEFAULT_TENANT_ID:          'test-tenant',
  },
}));

jest.mock('../../agent/memory', () => ({
  isHumanMode: jest.fn(),
  getThread:   jest.fn(),
  saveMessage: jest.fn(),
}));

jest.mock('../../agent/tools', () => ({
  TOOL_DEFINITIONS: [],
  executeTool: jest.fn(),
}));

jest.mock('../../agent/session-classifier', () => ({
  classifySession: jest.fn().mockReturnValue('default'),
}));

jest.mock('../../agent/customer-memory', () => ({
  getCustomerInsights:   jest.fn().mockResolvedValue({ total_interactions: 0 }),
  buildInsightsContext:  jest.fn().mockReturnValue(''),
}));

jest.mock('../../agent/skill', () => ({
  getSkillConfig: jest.fn().mockResolvedValue({
    tenantId: 'salesnet',
    business: { providerName: 'Test', agentName: 'Sofia' },
    plans: [],
    coveredNeighborhoods: [],
    erpCapabilities: {},
  }),
  buildSystemPrompt: jest.fn().mockReturnValue('test-prompt'),
  buildModeContext:  jest.fn().mockReturnValue(''),
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

jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: {
    sendText: jest.fn(),
  },
}));

import { processMessage } from '../../agent/processor';
import { isHumanMode, getThread, saveMessage } from '../../agent/memory';
import { executeTool } from '../../agent/tools';
import { anthropic } from '../../config/anthropic';
import { whatsappService } from '../../services/whatsapp-service';

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
    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });
});

describe('processMessage — normal flow', () => {
  beforeEach(() => {
    (isHumanMode as jest.Mock).mockResolvedValue(false);
    (saveMessage as jest.Mock).mockResolvedValue(undefined);
    (getThread as jest.Mock).mockResolvedValue(THREAD);
    (executeTool as jest.Mock).mockResolvedValue(CUSTOMER);
    (anthropic.messages.create as jest.Mock).mockResolvedValue(TEXT_RESPONSE);
    (whatsappService.sendText as jest.Mock).mockResolvedValue(undefined);
  });

  it('saves user message before calling Claude', async () => {
    await processMessage(PHONE, 'Quero ver minha fatura');
    expect(saveMessage).toHaveBeenCalledWith(PHONE, 'user', 'Quero ver minha fatura');
  });

  it('calls executeTool buscar_cliente with phone before Claude', async () => {
    await processMessage(PHONE, 'Oi');
    expect(executeTool).toHaveBeenCalledWith('buscar_cliente', { phone: PHONE }, PHONE);
  });

  it('sends Claude response via WhatsApp', async () => {
    await processMessage(PHONE, 'Oi');
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      PHONE,
      'Olá João! Posso ajudar?'
    );
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
    (whatsappService.sendText as jest.Mock).mockResolvedValue(undefined);

    // buscar_cliente returns customer; proactive get_fatura_atual returns invoice;
    // LLM-triggered get_fatura_atual also returns invoice
    (executeTool as jest.Mock)
      .mockResolvedValueOnce(CUSTOMER)                                    // buscar_cliente
      .mockResolvedValueOnce({ id: 'inv-1', amount: 90, status: 'open' }) // proactive get_fatura_atual
      .mockResolvedValueOnce({ id: 'inv-1', amount: 90, status: 'open' }); // LLM-triggered get_fatura_atual

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
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      PHONE,
      'Sua fatura é R$90.'
    );
  });
});
