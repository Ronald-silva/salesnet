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

jest.mock('../../agent/customer-lookup', () => ({
  lookupCustomer: jest.fn(),
  extractCpfFromText: jest.fn().mockReturnValue(null),
  buildIdentificationContext: jest.fn().mockReturnValue(''),
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
  buildSystemPrompt:    jest.fn().mockReturnValue('test-prompt'),
  buildModeContext:     jest.fn().mockReturnValue(''),
  buildQualityExamples: jest.fn().mockResolvedValue(''),
}));

jest.mock('../../config/anthropic', () => ({
  anthropic: { messages: { create: jest.fn() } },
}));

jest.mock('../../config/supabase', () => {
  const makeChain = () => {
    const chain: Record<string, jest.Mock> = {};
    const noop = () => chain;
    for (const m of ['select','eq','neq','ilike','gte','lte','limit','order','overlaps','in','contains','not']) {
      chain[m] = jest.fn(noop);
    }
    chain['insert']      = jest.fn(() => chain);
    chain['upsert']      = jest.fn(() => chain);
    chain['single']      = jest.fn().mockResolvedValue({ data: null, error: null });
    chain['maybeSingle'] = jest.fn().mockResolvedValue({ data: null, error: null });
    // make the chain itself awaitable so `await from(...).select(...)` resolves
    (chain as unknown as { then: unknown })['then'] = jest.fn(
      (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
    );
    return chain;
  };
  return { supabase: { from: jest.fn(() => makeChain()) } };
});

jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: {
    sendText: jest.fn(),
  },
}));

import { processMessage } from '../../agent/processor';
import { isHumanMode, getThread, saveMessage } from '../../agent/memory';
import { executeTool } from '../../agent/tools';
import { lookupCustomer, extractCpfFromText } from '../../agent/customer-lookup';
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
  usage: { input_tokens: 10, output_tokens: 20 },
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
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: CUSTOMER,
      method: 'phone',
      attempts: ['phone'],
    });
    (executeTool as jest.Mock).mockResolvedValue(CUSTOMER);
    (anthropic.messages.create as jest.Mock).mockResolvedValue(TEXT_RESPONSE);
    (whatsappService.sendText as jest.Mock).mockResolvedValue(undefined);
  });

  it('saves user message before calling Claude', async () => {
    await processMessage(PHONE, 'Quero ver minha fatura');
    expect(saveMessage).toHaveBeenCalledWith(PHONE, 'user', 'Quero ver minha fatura', 'test-tenant');
  });

  it('calls lookupCustomer with phone before Claude', async () => {
    await processMessage(PHONE, 'Oi');
    expect(lookupCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ whatsappPhone: PHONE }),
    );
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
    expect(saveMessage).toHaveBeenCalledWith(PHONE, 'assistant', 'Olá João! Posso ajudar?', 'test-tenant');
  });
});

describe('processMessage — tool use loop', () => {
  it('executes requested tools and gets final response', async () => {
    (isHumanMode as jest.Mock).mockResolvedValue(false);
    (saveMessage as jest.Mock).mockResolvedValue(undefined);
    (getThread as jest.Mock).mockResolvedValue(THREAD);
    (whatsappService.sendText as jest.Mock).mockResolvedValue(undefined);

    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: CUSTOMER,
      method: 'phone',
      attempts: ['phone'],
    });

    // proactive get_fatura_atual + LLM-triggered get_fatura_atual
    (executeTool as jest.Mock)
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
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    const finalResponse = {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Sua fatura é R$90.' }],
      usage: { input_tokens: 15, output_tokens: 20 },
    };

    (anthropic.messages.create as jest.Mock)
      .mockResolvedValueOnce(toolUseResponse)
      .mockResolvedValueOnce(finalResponse);

    await processMessage(PHONE, 'Qual minha fatura?');

    expect(executeTool).toHaveBeenCalledWith('get_fatura_atual', { customer_id: 'c1' }, PHONE, 'test-tenant');
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      PHONE,
      'Sua fatura é R$90.'
    );
  });

  it('never sends SGP portal credentials to the LLM, even when a tool result carries them', async () => {
    (isHumanMode as jest.Mock).mockResolvedValue(false);
    (saveMessage as jest.Mock).mockResolvedValue(undefined);
    (getThread as jest.Mock).mockResolvedValue(THREAD);
    (whatsappService.sendText as jest.Mock).mockResolvedValue(undefined);
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: CUSTOMER,
      method: 'phone',
      attempts: ['phone'],
    });

    (executeTool as jest.Mock).mockResolvedValueOnce({
      id: 'c1',
      name: 'João Silva',
      status: 'active',
      contratoCentralLogin: 'joao.silva',
      contratoCentralSenha: 'super-secreta',
    });

    const toolUseResponse = {
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', id: 'toolu_001', name: 'buscar_cliente', input: { phone: PHONE } },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    const finalResponse = {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Encontrei seu contrato.' }],
      usage: { input_tokens: 15, output_tokens: 20 },
    };
    (anthropic.messages.create as jest.Mock)
      .mockResolvedValueOnce(toolUseResponse)
      .mockResolvedValueOnce(finalResponse);

    await processMessage(PHONE, 'meu cpf é 049.763.013-38');

    const secondCallArgs = (anthropic.messages.create as jest.Mock).mock.calls[1]![0];
    const toolResultContent = JSON.stringify(secondCallArgs.messages);
    expect(toolResultContent).not.toContain('joao.silva');
    expect(toolResultContent).not.toContain('super-secreta');
    expect(toolResultContent).not.toContain('contratoCentralLogin');
    expect(toolResultContent).not.toContain('contratoCentralSenha');
  });
});

describe('processMessage — invalid CPF in the message', () => {
  beforeEach(() => {
    (isHumanMode as jest.Mock).mockResolvedValue(false);
    (saveMessage as jest.Mock).mockResolvedValue(undefined);
    (getThread as jest.Mock).mockResolvedValue(THREAD);
    (executeTool as jest.Mock).mockResolvedValue(CUSTOMER);
    (anthropic.messages.create as jest.Mock).mockResolvedValue(TEXT_RESPONSE);
    (whatsappService.sendText as jest.Mock).mockResolvedValue(undefined);
  });

  it('never forwards a checksum-invalid CPF to lookupCustomer (never reaches the SGP)', async () => {
    (extractCpfFromText as jest.Mock).mockReturnValueOnce('00000000000');
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: { error: 'Cliente não encontrado' },
      method: null,
      attempts: ['phone'],
    });

    await processMessage(PHONE, 'meu cpf é 00000000000');

    expect(lookupCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ cpfFromMessage: null }),
    );
  });

  it('tells Sofia (via system context) that the CPF looks invalid instead of "not found"', async () => {
    (extractCpfFromText as jest.Mock).mockReturnValueOnce('00000000000');
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: { error: 'Cliente não encontrado' },
      method: null,
      attempts: ['phone'],
    });

    await processMessage(PHONE, 'meu cpf é 00000000000');

    const firstCallArgs = (anthropic.messages.create as jest.Mock).mock.calls[0]![0];
    expect(firstCallArgs.system).toContain('CPF informado pelo cliente parece inválido');
  });

  it('forwards a checksum-valid CPF normally', async () => {
    (extractCpfFromText as jest.Mock).mockReturnValueOnce('04976301338');
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: CUSTOMER,
      method: 'cpf',
      cpfUsed: '04976301338',
      attempts: ['phone', 'cpf'],
    });

    await processMessage(PHONE, 'meu cpf é 049.763.013-38');

    expect(lookupCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ cpfFromMessage: '04976301338' }),
    );
    const firstCallArgs = (anthropic.messages.create as jest.Mock).mock.calls[0]![0];
    expect(firstCallArgs.system).not.toContain('parece inválido');
  });
});
