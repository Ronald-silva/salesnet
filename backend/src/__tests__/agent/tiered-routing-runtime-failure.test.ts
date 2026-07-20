/**
 * Forensic reproduction (Ronald, verificação pontual de roteamento LLM): mesma
 * pergunta do outro arquivo (tiered-routing-missing-key.test.ts), mas para uma
 * falha de runtime GENUÍNA (chave presente, chamada de rede falha — rate limit/timeout/
 * chave inválida) em vez de chave ausente. Confirma que o comportamento visível
 * (tenta Anthropic, loga o erro real) é diferente do cenário de chave ausente, mas que
 * ambos os caminhos agora convergem no mesmo tier_downgraded=true (fix Item 3).
 */
jest.mock('../../config/env', () => ({
  env: {
    LLM_ROUTING_MODE:           'tiered',
    LLM_PROVIDER:               'anthropic',
    LLM_FALLBACK_PROVIDER:      'deepseek', // fallback explicitamente configurado
    ANTHROPIC_API_KEY:          'sk-ant-present-but-will-fail-at-call-time',
    DEEPSEEK_API_KEY:           'test-deepseek-key',
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
  extractBareCpfWhenAsked: jest.fn().mockReturnValue(null),
  hasInvalidBareCpfCandidate: jest.fn().mockReturnValue(false),
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

jest.mock('axios', () => {
  const mockInstance = {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    post: jest.fn(),
    get: jest.fn(),
  };
  return {
    __esModule: true,
    default: {
      create: jest.fn(() => mockInstance),
      post: jest.fn(),
      interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    },
  };
});

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
    (chain as unknown as { then: unknown })['then'] = jest.fn(
      (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
    );
    return chain;
  };
  return { supabase: { from: jest.fn(() => makeChain()) } };
});

jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: { sendText: jest.fn() },
}));

import axios from 'axios';
import { processMessage } from '../../agent/processor';
import { isHumanMode, getThread, saveMessage } from '../../agent/memory';
import { lookupCustomer } from '../../agent/customer-lookup';
import { anthropic } from '../../config/anthropic';
import { whatsappService } from '../../services/whatsapp-service';
import { supabase } from '../../config/supabase';

const PHONE = '+5585999990000';
const THREAD = {
  id: 'uuid-1',
  phone: PHONE,
  messages: [] as Array<{ role: string; content: string; timestamp: string }>,
  human_mode: false,
  churn_risk: false,
};
const CUSTOMER = { id: 'c1', name: 'João Silva', status: 'active' };

const COMPLEX_MESSAGE = 'Vou entrar com uma ação judicial no Procon contra a empresa';

const DEEPSEEK_RESPONSE = {
  data: {
    choices: [{ message: { content: 'Resposta gerada via DeepSeek (fallback).', tool_calls: [] } }],
    usage: { prompt_tokens: 50, completion_tokens: 30 },
  },
};

function interactionLogInserts(): Record<string, unknown>[] {
  const fromMock = supabase.from as jest.Mock;
  return fromMock.mock.calls
    .map((args: unknown[], i: number) => ({
      table: args[0] as string,
      chain: fromMock.mock.results[i]!.value as { insert: jest.Mock },
    }))
    .filter((c) => c.table === 'interaction_logs' && c.chain.insert.mock.calls.length > 0)
    .map((c) => c.chain.insert.mock.calls[0]![0] as Record<string, unknown>);
}

describe('tiered routing — complex tier + falha de runtime genuína na Anthropic (chave presente)', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    (isHumanMode as jest.Mock).mockResolvedValue(false);
    (saveMessage as jest.Mock).mockResolvedValue(undefined);
    (getThread as jest.Mock).mockResolvedValue(THREAD);
    (lookupCustomer as jest.Mock).mockResolvedValue({ customer: CUSTOMER, method: 'phone', attempts: ['phone'] });
    (whatsappService.sendText as jest.Mock).mockResolvedValue(undefined);
    (axios.post as jest.Mock).mockResolvedValue(DEEPSEEK_RESPONSE);
    // Simula timeout/erro de rede genérico — NÃO um erro de autenticação específico.
    (anthropic.messages.create as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Request timed out'), { code: 'ETIMEDOUT' }),
    );
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('TENTA a Anthropic primeiro (diferente do cenário de chave ausente) e só then cai para o fallback', async () => {
    await processMessage(PHONE, COMPLEX_MESSAGE);
    expect(anthropic.messages.create).toHaveBeenCalled();
    expect(axios.post).toHaveBeenCalled();
  });

  it('loga o erro via console.error com o motivo real (visível) — mais visível que o cenário de chave ausente', async () => {
    await processMessage(PHONE, COMPLEX_MESSAGE);

    const allErrorLines = errorSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    console.info('--- console.error capturado ---\n' + allErrorLines);

    expect(allErrorLines).toMatch(/provider anthropic failed, trying fallback deepseek/);
    expect(allErrorLines).toMatch(/Request timed out|ETIMEDOUT/);
  });

  it('interaction_logs.llm_provider grava "deepseek" e tier_downgraded=true expõe que a Anthropic foi tentada e falhou (fix Item 3)', async () => {
    await processMessage(PHONE, COMPLEX_MESSAGE);

    const inserts = interactionLogInserts();
    expect(inserts.length).toBeGreaterThan(0);
    const row = inserts[inserts.length - 1]!;

    console.info('--- interaction_logs insert capturado ---\n' + JSON.stringify(row, null, 2));

    expect(row.llm_provider).toBe('deepseek');
    expect(row).not.toHaveProperty('tier');
    expect(row.tier_downgraded).toBe(true);
    expect(row).not.toHaveProperty('requested_provider');
    // provider_error nunca foi implementado (fora do escopo do Item 3) — o texto do
    // erro real só existe hoje via console.error, não em interaction_logs.
    expect(row).not.toHaveProperty('provider_error');
  });
});
