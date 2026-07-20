/**
 * Forensic reproduction (Ronald, verificação pontual de roteamento LLM) do cenário
 * em que LLM_ROUTING_MODE=tiered classifica uma mensagem como tier 'complex'
 * (COMPLEX_RE — Procon/Anatel/judicial) mas ANTHROPIC_API_KEY está ausente.
 * Atualizado após o fix do Item 3 (interaction_logs.tier_downgraded, migration 040):
 * as duas primeiras asserções documentam o comportamento de roteamento em si
 * (nunca chama Anthropic, log neutro); a última confirma que a degradação agora
 * fica registrada em tier_downgraded.
 */
jest.mock('../../config/env', () => ({
  env: {
    LLM_ROUTING_MODE:           'tiered',
    LLM_PROVIDER:               'anthropic',
    LLM_FALLBACK_PROVIDER:      undefined,
    ANTHROPIC_API_KEY:          undefined, // <- cenário sob teste: chave ausente
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
    choices: [{ message: { content: 'Resposta gerada via DeepSeek.', tool_calls: [] } }],
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

describe('tiered routing — complex tier + ANTHROPIC_API_KEY ausente', () => {
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
    // Se isso for chamado, o teste deve falhar — a hipótese é que NUNCA é chamado
    // quando ANTHROPIC_API_KEY está ausente em tier=complex.
    (anthropic.messages.create as jest.Mock).mockRejectedValue(
      new Error('TESTE: anthropic.messages.create não deveria ser chamado sem API key'),
    );
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('nunca tenta chamar a Anthropic — pickProviderForComplex() já retorna deepseek antes de qualquer tentativa', async () => {
    await processMessage(PHONE, COMPLEX_MESSAGE);
    expect(anthropic.messages.create).not.toHaveBeenCalled();
    expect(axios.post).toHaveBeenCalled();
  });

  it('só deixa rastro em console.log neutro (tier=complex provider=deepseek), sem marcar "downgrade" ou "fallback"', async () => {
    await processMessage(PHONE, COMPLEX_MESSAGE);

    const allLogLines = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    console.info('--- console.log capturado ---\n' + allLogLines); // visível no output do teste

    expect(allLogLines).toMatch(/tier=complex/);
    expect(allLogLines).toMatch(/provider=deepseek/);
    // Nenhuma menção explícita de que isso é uma degradação/fallback do tier pretendido.
    expect(allLogLines.toLowerCase()).not.toMatch(/downgrade|fallback|degrad/);

    // console.error nunca dispara — não há "falha" visível, é uma escolha silenciosa.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('interaction_logs.llm_provider grava "deepseek" (o que foi usado) e tier_downgraded=true expõe que o tier complex queria Anthropic (fix Item 3)', async () => {
    await processMessage(PHONE, COMPLEX_MESSAGE);

    const inserts = interactionLogInserts();
    expect(inserts.length).toBeGreaterThan(0);
    const row = inserts[inserts.length - 1]!;

    console.info('--- interaction_logs insert capturado ---\n' + JSON.stringify(row, null, 2));

    expect(row.llm_provider).toBe('deepseek');
    // 'tier' e 'requested_provider' continuam fora do schema (não existem como coluna);
    // tier_downgraded (migration 040) é o único campo que expõe a degradação.
    expect(row).not.toHaveProperty('tier');
    expect(row.tier_downgraded).toBe(true);
    expect(row).not.toHaveProperty('requested_provider');
  });
});
