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
import { lookupCustomer, extractCpfFromText, extractBareCpfWhenAsked } from '../../agent/customer-lookup';
import { anthropic } from '../../config/anthropic';
import { whatsappService } from '../../services/whatsapp-service';
import { supabase } from '../../config/supabase';

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

    // "fatura"/"quero"/etc. tornariam a mensagem candidata à desambiguação por
    // LLM, cuja chamada extra consumiria o 1º mock encadeado do Anthropic e o
    // loop de tool-use nunca rodaria (o teste passava por coincidência: a
    // pré-execução proativa satisfaz o toHaveBeenCalledWith e o finalResponse
    // virava a resposta principal). Mensagem fora do regex de candidatos.
    await processMessage(PHONE, 'me mostra o boleto');

    expect(executeTool).toHaveBeenCalledWith('get_fatura_atual', { customer_id: 'c1' }, PHONE, 'test-tenant');
    // 2 chamadas = proativa (passo 9) + a disparada pelo LLM no loop. Só a contagem
    // distingue o loop real da coincidência: a proativa sozinha já satisfaz o
    // toHaveBeenCalledWith acima com os mesmos argumentos.
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(anthropic.messages.create).toHaveBeenCalledTimes(2);
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

describe('processMessage — delivery status', () => {
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
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function interactionLogsInserts(): Array<Record<string, unknown>> {
    const fromMock = supabase.from as jest.Mock;
    const inserts: Array<Record<string, unknown>> = [];
    fromMock.mock.calls.forEach((callArgs, i) => {
      if (callArgs[0] !== 'interaction_logs') return;
      const chain = fromMock.mock.results[i]!.value as { insert: jest.Mock };
      chain.insert.mock.calls.forEach((c) => inserts.push(c[0] as Record<string, unknown>));
    });
    return inserts;
  }

  it('retries sendText and records delivery_status "sent" when the second attempt succeeds', async () => {
    jest.useFakeTimers();
    (whatsappService.sendText as jest.Mock)
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue(undefined);

    const promise = processMessage(PHONE, 'Oi');
    await jest.advanceTimersByTimeAsync(1_000); // first retry backoff
    await promise;

    expect(whatsappService.sendText).toHaveBeenCalledTimes(2);
    const logs = interactionLogsInserts();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ delivery_status: 'sent', delivery_error: null });
  });

  it('records delivery_status "failed" with the undelivered content when sendText fails on every attempt', async () => {
    jest.useFakeTimers();
    (whatsappService.sendText as jest.Mock).mockRejectedValue(new Error('instance disconnected'));

    const promise = processMessage(PHONE, 'Oi');
    await jest.advanceTimersByTimeAsync(1_000); // 1st retry backoff
    await jest.advanceTimersByTimeAsync(3_000); // 2nd retry backoff
    await promise;

    expect(whatsappService.sendText).toHaveBeenCalledTimes(3);
    const logs = interactionLogsInserts();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      delivery_status: 'failed',
      delivery_error: expect.stringContaining('instance disconnected'),
      response: 'Olá João! Posso ajudar?',
    });
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

  it('forwards a short bare checksum-valid CPF even when Sofia did not ask for CPF first', async () => {
    (extractCpfFromText as jest.Mock).mockReturnValueOnce(null);
    (extractBareCpfWhenAsked as jest.Mock).mockReturnValueOnce('04976301338');
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: CUSTOMER,
      method: 'cpf',
      cpfUsed: '04976301338',
      attempts: ['phone', 'cpf'],
    });

    await processMessage(PHONE, '04976301338');

    expect(lookupCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ cpfFromMessage: '04976301338' }),
    );
  });
});

describe('processMessage — PIX token substitution', () => {
  const RAW_PIX =
    '00020126580014BR.GOV.BCB.PIX0136aaaabbbb-cccc-dddd-eeee-ffff000011115204000053039865802BR5913SALESNET6009FORTALEZA62070503***6304ABCD';
  const PIX_TOOL_USE = {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: 'tu-pix', name: 'gerar_pix', input: {} }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
  const PIX_FALLBACK =
    'Desculpe, tive uma falha técnica gerando seu código PIX agora. Pode repetir o pedido, por favor?';

  beforeEach(() => {
    jest.clearAllMocks();
    (isHumanMode as jest.Mock).mockResolvedValue(false);
    (getThread as jest.Mock).mockResolvedValue(THREAD);
    (lookupCustomer as jest.Mock).mockResolvedValue({ customer: CUSTOMER, method: 'phone', attempts: [] });
    (extractCpfFromText as jest.Mock).mockReturnValue(null);
    (extractBareCpfWhenAsked as jest.Mock).mockReturnValue(null);
    (whatsappService.sendText as jest.Mock).mockResolvedValue(undefined);
  });

  it('shows the LLM only a placeholder, delivers the code in its own separate message, and saves the placeholder to the thread', async () => {
    (executeTool as jest.Mock).mockResolvedValue({ invoiceId: '9001', pixKey: RAW_PIX });
    (anthropic.messages.create as jest.Mock)
      .mockResolvedValueOnce(PIX_TOOL_USE)
      .mockImplementationOnce((req: { messages: Array<{ content: unknown }> }) => {
        const toolResultJson = JSON.stringify(req.messages[req.messages.length - 1]!.content);
        // O LLM nunca vê o payload cru
        expect(toolResultJson).not.toContain(RAW_PIX);
        const placeholder = /\{\{PIX_[0-9a-f]{8}\}\}/.exec(toolResultJson)?.[0];
        expect(placeholder).toBeDefined();
        return Promise.resolve({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: `Aqui está seu PIX:\n${placeholder}\nCopie o código inteiro e pague no app do seu banco.` }],
          usage: { input_tokens: 10, output_tokens: 20 },
        });
      });

    await processMessage(PHONE, 'me manda o pix');

    // Envio quebrado em mensagens separadas: contexto, código puro sozinho, instrução
    const sends = (whatsappService.sendText as jest.Mock).mock.calls.map((c) => c[2] as string);
    expect(sends).toEqual([
      'Aqui está seu PIX:',
      RAW_PIX,
      'Copie o código inteiro e pague no app do seu banco.',
    ]);

    const savedAssistant = (saveMessage as jest.Mock).mock.calls.find((c) => c[1] === 'assistant');
    expect(savedAssistant![2]).toContain('{{PIX_');
    expect(savedAssistant![2]).not.toContain(RAW_PIX);
  });

  it('splits multiple invoices into one isolated message per code, keeping order and per-invoice context', async () => {
    const RAW_PIX_2 =
      '00020126580014BR.GOV.BCB.PIX0136bbbbcccc-dddd-eeee-ffff-000011112222520400005303986540515.005802BR5913SALESNET6009FORTALEZA62070503***63041234';
    (executeTool as jest.Mock).mockResolvedValue({
      invoices: [
        { id: '9001', pixCode: RAW_PIX },
        { id: '9002', pixCode: RAW_PIX_2 },
      ],
    });
    (anthropic.messages.create as jest.Mock)
      .mockResolvedValueOnce(PIX_TOOL_USE)
      .mockImplementationOnce((req: { messages: Array<{ content: unknown }> }) => {
        const toolResultJson = JSON.stringify(req.messages[req.messages.length - 1]!.content);
        const placeholders = toolResultJson.match(/\{\{PIX_[0-9a-f]{8}\}\}/g);
        expect(placeholders).toHaveLength(2);
        return Promise.resolve({
          stop_reason: 'end_turn',
          content: [{
            type: 'text',
            text: `Fatura de junho:\n${placeholders![0]}\nFatura de julho:\n${placeholders![1]}\nQualquer dúvida me chame.`,
          }],
          usage: { input_tokens: 10, output_tokens: 20 },
        });
      });

    await processMessage(PHONE, 'me manda o pix');

    const sends = (whatsappService.sendText as jest.Mock).mock.calls.map((c) => c[2] as string);
    expect(sends).toEqual([
      'Fatura de junho:',
      RAW_PIX,
      'Fatura de julho:',
      RAW_PIX_2,
      'Qualquer dúvida me chame.',
    ]);
  });

  it('records delivery_status failed and stops the sequence when one message fails all retries', async () => {
    jest.useFakeTimers();
    (executeTool as jest.Mock).mockResolvedValue({ invoiceId: '9001', pixKey: RAW_PIX });
    (anthropic.messages.create as jest.Mock)
      .mockResolvedValueOnce(PIX_TOOL_USE)
      .mockImplementationOnce((req: { messages: Array<{ content: unknown }> }) => {
        const placeholder = /\{\{PIX_[0-9a-f]{8}\}\}/.exec(
          JSON.stringify(req.messages[req.messages.length - 1]!.content),
        )![0];
        return Promise.resolve({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: `Aqui está seu PIX:\n${placeholder}\nCopie o código inteiro.` }],
          usage: { input_tokens: 10, output_tokens: 20 },
        });
      });
    (whatsappService.sendText as jest.Mock)
      .mockResolvedValueOnce(undefined) // contexto entregue
      .mockRejectedValue(new Error('instance disconnected')); // código falha em todas as tentativas

    const promise = processMessage(PHONE, 'me manda o pix');
    await jest.advanceTimersByTimeAsync(1_000);
    await jest.advanceTimersByTimeAsync(3_000);
    await promise;
    jest.useRealTimers();

    // 1 envio ok + 3 tentativas do código; a instrução final nunca é tentada (aborta)
    expect(whatsappService.sendText).toHaveBeenCalledTimes(4);
    const fromMock = supabase.from as jest.Mock;
    const logInsert = fromMock.mock.calls
      .map((args: unknown[], i: number) => ({
        table: args[0] as string,
        chain: fromMock.mock.results[i]!.value as { insert: jest.Mock },
      }))
      .filter((c) => c.table === 'interaction_logs' && c.chain.insert.mock.calls.length > 0)
      .at(-1)!.chain.insert.mock.calls[0]![0] as { response: string; delivery_status: string };
    expect(logInsert.delivery_status).toBe('failed');
    // response guarda o texto completo pós-substituição para reenvio manual
    expect(logInsert.response).toContain(RAW_PIX);
  });

  it('logs the delivered text (real code) in interaction_logs.response and tokens in tool_calls', async () => {
    (executeTool as jest.Mock).mockResolvedValue({ invoiceId: '9001', pixKey: RAW_PIX });
    (anthropic.messages.create as jest.Mock)
      .mockResolvedValueOnce(PIX_TOOL_USE)
      .mockImplementationOnce((req: { messages: Array<{ content: unknown }> }) => {
        const placeholder = /\{\{PIX_[0-9a-f]{8}\}\}/.exec(
          JSON.stringify(req.messages[req.messages.length - 1]!.content),
        )![0];
        return Promise.resolve({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: `PIX: ${placeholder}` }],
          usage: { input_tokens: 10, output_tokens: 20 },
        });
      });

    await processMessage(PHONE, 'me manda o pix');

    const fromMock = supabase.from as jest.Mock;
    const logInsert = fromMock.mock.calls
      .map((args: unknown[], i: number) => ({
        table: args[0] as string,
        chain: fromMock.mock.results[i]!.value as { insert: jest.Mock },
      }))
      .filter((c) => c.table === 'interaction_logs' && c.chain.insert.mock.calls.length > 0)
      .at(-1)!.chain.insert.mock.calls[0]![0] as { response: string; tool_calls: Array<{ output: unknown }> };

    expect(logInsert.response).toContain(RAW_PIX);
    expect(JSON.stringify(logInsert.tool_calls)).not.toContain(RAW_PIX);
    expect(JSON.stringify(logInsert.tool_calls)).toContain('{{PIX_');
  });

  it('blocks a placeholder that no tool from this turn issued', async () => {
    (anthropic.messages.create as jest.Mock).mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Seu código: {{PIX_deadbeef}}' }],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    await processMessage(PHONE, 'me manda o pix');

    const sent = (whatsappService.sendText as jest.Mock).mock.calls[0]![2] as string;
    expect(sent).toBe(PIX_FALLBACK);
  });

  it('blocks a malformed leftover token (braces lost by the LLM)', async () => {
    (anthropic.messages.create as jest.Mock).mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Seu código: PIX_deadbeef' }],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    await processMessage(PHONE, 'me manda o pix');

    const sent = (whatsappService.sendText as jest.Mock).mock.calls[0]![2] as string;
    expect(sent).toBe(PIX_FALLBACK);
  });

  it('forces a directed retry when the LLM invents a placeholder without any invoice tool call, then delivers the real PIX (incident 2026-07-10 10:05)', async () => {
    (executeTool as jest.Mock).mockResolvedValue({ invoiceId: '244566', pixKey: RAW_PIX });
    (anthropic.messages.create as jest.Mock)
      // 1º turno: LLM responde direto com placeholder inventado, sem tool call
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Aqui está seu PIX:\n{{PIX_f7c6cffd}}\nCopie o código inteiro.' }],
        usage: { input_tokens: 10, output_tokens: 20 },
      })
      // retry dirigido: agora o LLM chama gerar_pix de verdade
      .mockResolvedValueOnce(PIX_TOOL_USE)
      .mockImplementationOnce((req: { messages: Array<{ content: unknown }> }) => {
        const placeholder = /\{\{PIX_[0-9a-f]{8}\}\}/.exec(
          JSON.stringify(req.messages[req.messages.length - 1]!.content),
        )![0];
        return Promise.resolve({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: `Aqui está seu PIX:\n${placeholder}\nCopie o código inteiro.` }],
          usage: { input_tokens: 10, output_tokens: 20 },
        });
      });

    await processMessage(PHONE, 'me manda o pix');

    // O retry recebe a resposta inventada + correção instruindo a chamar gerar_pix
    const retryCallArgs = (anthropic.messages.create as jest.Mock).mock.calls[1]![0] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const lastMessage = retryCallArgs.messages[retryCallArgs.messages.length - 1]!;
    expect(lastMessage.role).toBe('user');
    expect(JSON.stringify(lastMessage.content)).toContain('gerar_pix');

    // PIX real entregue em mensagem própria; nenhum fallback enviado
    const sends = (whatsappService.sendText as jest.Mock).mock.calls.map((c) => c[2] as string);
    expect(sends).toEqual(['Aqui está seu PIX:', RAW_PIX, 'Copie o código inteiro.']);

    const fromMock = supabase.from as jest.Mock;
    const logInsert = fromMock.mock.calls
      .map((args: unknown[], i: number) => ({
        table: args[0] as string,
        chain: fromMock.mock.results[i]!.value as { insert: jest.Mock },
      }))
      .filter((c) => c.table === 'interaction_logs' && c.chain.insert.mock.calls.length > 0)
      .at(-1)!.chain.insert.mock.calls[0]![0] as {
        tool_calls: Array<{ name: string }>;
        delivery_status: string;
      };
    const toolNames = logInsert.tool_calls.map((t) => t.name);
    expect(toolNames).toContain('pix_retry_forced');
    expect(toolNames).toContain('gerar_pix');
    expect(toolNames).not.toContain('pix_token_blocked');
    expect(logInsert.delivery_status).toBe('sent');
  });

  it('falls back to the generic message when the LLM invents a placeholder again after the directed retry (single retry cap)', async () => {
    (anthropic.messages.create as jest.Mock).mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Seu código: {{PIX_f7c6cffd}}' }],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    await processMessage(PHONE, 'me manda o pix');

    // 1 chamada original + 1 retry dirigido — nunca um segundo retry
    expect(anthropic.messages.create).toHaveBeenCalledTimes(2);
    expect(whatsappService.sendText).toHaveBeenCalledTimes(1);
    expect((whatsappService.sendText as jest.Mock).mock.calls[0]![2]).toBe(PIX_FALLBACK);

    const fromMock = supabase.from as jest.Mock;
    const logInsert = fromMock.mock.calls
      .map((args: unknown[], i: number) => ({
        table: args[0] as string,
        chain: fromMock.mock.results[i]!.value as { insert: jest.Mock },
      }))
      .filter((c) => c.table === 'interaction_logs' && c.chain.insert.mock.calls.length > 0)
      .at(-1)!.chain.insert.mock.calls[0]![0] as { tool_calls: Array<{ name: string }> };
    const toolNames = logInsert.tool_calls.map((t) => t.name);
    expect(toolNames).toContain('pix_retry_forced');
    expect(toolNames).toContain('pix_token_blocked');
  });

  it('does NOT retry when the unknown placeholder appears alongside a real gerar_pix call (different signature)', async () => {
    (executeTool as jest.Mock).mockResolvedValue({ invoiceId: '9001', pixKey: RAW_PIX });
    (anthropic.messages.create as jest.Mock)
      .mockResolvedValueOnce(PIX_TOOL_USE)
      // LLM chamou gerar_pix mas escreveu um token diferente do emitido
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Seu código: {{PIX_00000000}}' }],
        usage: { input_tokens: 10, output_tokens: 20 },
      });

    await processMessage(PHONE, 'me manda o pix');

    expect(anthropic.messages.create).toHaveBeenCalledTimes(2);
    expect((whatsappService.sendText as jest.Mock).mock.calls[0]![2]).toBe(PIX_FALLBACK);

    const fromMock = supabase.from as jest.Mock;
    const logInsert = fromMock.mock.calls
      .map((args: unknown[], i: number) => ({
        table: args[0] as string,
        chain: fromMock.mock.results[i]!.value as { insert: jest.Mock },
      }))
      .filter((c) => c.table === 'interaction_logs' && c.chain.insert.mock.calls.length > 0)
      .at(-1)!.chain.insert.mock.calls[0]![0] as { tool_calls: Array<{ name: string }> };
    const toolNames = logInsert.tool_calls.map((t) => t.name);
    expect(toolNames).not.toContain('pix_retry_forced');
    expect(toolNames).toContain('pix_token_blocked');
  });

  it('still blocks a raw EMV payload typed by the LLM (defense in depth)', async () => {
    (executeTool as jest.Mock).mockResolvedValue({ invoiceId: '9001', pixKey: RAW_PIX });
    (anthropic.messages.create as jest.Mock)
      .mockResolvedValueOnce(PIX_TOOL_USE)
      // LLM ignora o placeholder e "digita" o código (impossível legítimo: nunca o viu)
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: `Seu código: ${RAW_PIX}` }],
        usage: { input_tokens: 10, output_tokens: 20 },
      });

    await processMessage(PHONE, 'me manda o pix');

    const sent = (whatsappService.sendText as jest.Mock).mock.calls[0]![2] as string;
    expect(sent).toBe(PIX_FALLBACK);
  });
});
