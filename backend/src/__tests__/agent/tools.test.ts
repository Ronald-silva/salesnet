jest.mock('../../config/env', () => ({
  env: {
    DEFAULT_TENANT_ID: 'salesnet-default',
  },
}));

jest.mock('../../integrations/sgp', () => ({
  getCustomerByPhone:      jest.fn(),
  getCustomerByCpf:        jest.fn(),
  getContratoPhonesByCpf:  jest.fn().mockResolvedValue([]),
  getCurrentInvoice:       jest.fn(),
  getCustomerInvoices:     jest.fn(),
  generatePixKey:          jest.fn(),
  getCustomerTickets:      jest.fn(),
  openTicket:              jest.fn(),
  scheduleVisit:           jest.fn(),
  getConnectionStatus:     jest.fn(),
  getCustomerById:         jest.fn(),
}));

jest.mock('../../agent/memory', () => ({
  setHumanMode:      jest.fn(),
  getThreadCpf:      jest.fn().mockResolvedValue(null),
  persistThreadCpf:  jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../agent/customer-lookup', () => ({
  lookupCustomer: jest.fn(),
}));

const mockFrom = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../config/supabase', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

import { executeTool, TOOL_DEFINITIONS } from '../../agent/tools';
import * as sgp from '../../integrations/sgp';
import { setHumanMode, persistThreadCpf } from '../../agent/memory';
import { lookupCustomer } from '../../agent/customer-lookup';

const PHONE = '+5585999990000';

/** Chainable + thenable Supabase query-builder mock: every method returns itself,
 * and the builder can be awaited (or terminated via .limit/.maybeSingle/.single)
 * at whatever point the real query chain happens to stop. */
function buildQueryMock(finalResult: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'insert', 'limit']) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.maybeSingle = jest.fn().mockResolvedValue(finalResult);
  builder.single = jest.fn().mockResolvedValue(finalResult);
  builder.then = (resolve: (v: typeof finalResult) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(finalResult).then(resolve, reject);
  return builder;
}

describe('TOOL_DEFINITIONS', () => {
  it('exports exactly 25 tools', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(25);
  });

  it('every tool has name, description, and input_schema', () => {
    TOOL_DEFINITIONS.forEach((tool) => {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.input_schema).toBeDefined();
    });
  });
});

describe('executeTool — buscar_cliente', () => {
  it('calls lookupCustomer with whatsapp phone', async () => {
    const customer = { id: 'c1', name: 'João Silva', status: 'active' };
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer,
      method: 'phone',
      attempts: ['phone'],
    });

    const result = await executeTool('buscar_cliente', { phone: PHONE }, PHONE);
    expect(lookupCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ whatsappPhone: PHONE }),
    );
    expect(result).toEqual(customer);
  });

  it('blocks a cross-phone lookup without a verifying CPF (IDOR guard)', async () => {
    const result = await executeTool(
      'buscar_cliente',
      { phone: '+5585888887777' },
      PHONE,
    );
    expect(sgp.getCustomerByPhone).not.toHaveBeenCalled();
    expect(result).toMatchObject({ cross_phone_attempt: true });
    expect(result).not.toHaveProperty('id');
  });

  it('blocks a cross-phone lookup when the CPF does not match the target phone', async () => {
    (sgp.getCustomerByPhone as jest.Mock).mockResolvedValue({
      id: 'c1', name: 'João Silva', status: 'active', document: '11111111111',
    });

    const result = await executeTool(
      'buscar_cliente',
      { phone: '+5585888887777', cpf: '049.763.013-38' },
      PHONE,
    );
    expect(result).toEqual({ error: 'Cliente não encontrado', cross_phone_attempt: true });
  });

  it('blocks a cross-phone lookup identically whether the target phone exists or not (no existence leak)', async () => {
    (sgp.getCustomerByPhone as jest.Mock).mockRejectedValue(new Error('Cliente não encontrado'));

    const result = await executeTool(
      'buscar_cliente',
      { phone: '+5585888887777', cpf: '049.763.013-38' },
      PHONE,
    );
    expect(result).toEqual({ error: 'Cliente não encontrado', cross_phone_attempt: true });
  });

  it('allows a cross-phone lookup when the supplied CPF matches the target phone', async () => {
    const customer = { id: 'c1', name: 'João Silva', status: 'active', document: '04976301338' };
    (sgp.getCustomerByPhone as jest.Mock).mockResolvedValue(customer);

    const result = await executeTool(
      'buscar_cliente',
      { phone: '+5585888887777', cpf: '049.763.013-38' },
      PHONE,
    );
    expect(sgp.getCustomerByPhone).toHaveBeenCalledWith('+5585888887777');
    expect(result).toEqual({ ...customer, cross_phone_attempt: true });
  });

  it('does not treat the caller\'s own phone (different formatting) as cross-phone', async () => {
    const customer = { id: 'c1', name: 'João Silva', status: 'active' };
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer,
      method: 'phone',
      attempts: ['phone'],
    });

    const result = await executeTool('buscar_cliente', { phone: '85999990000' }, PHONE);
    expect(sgp.getCustomerByPhone).not.toHaveBeenCalled();
    expect(lookupCustomer).toHaveBeenCalledWith(expect.objectContaining({ whatsappPhone: PHONE }));
    expect(result).toEqual(customer);
  });

  it('returns error object when customer not found', async () => {
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: { error: 'Cliente não encontrado' },
      method: null,
      attempts: ['phone'],
    });

    const result = await executeTool('buscar_cliente', { phone: PHONE }, PHONE);
    expect(result).toEqual({ error: 'Cliente não encontrado' });
  });

  it('rejects a checksum-invalid CPF before it ever reaches lookupCustomer/SGP', async () => {
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: { error: 'Cliente não encontrado' },
      method: null,
      attempts: ['phone'],
    });

    // "00000000000" passes length but fails modulo-11 — this is the exact sequence
    // that live-matched an unrelated real customer's dirty SGP record.
    const result = await executeTool('buscar_cliente', { phone: PHONE, cpf: '000.000.000-00' }, PHONE);

    expect(lookupCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ cpfFromMessage: null }),
    );
    expect(sgp.getCustomerByCpf).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'CPF inválido. Verifique os dígitos e tente novamente.' });
  });

  it('forwards a checksum-valid CPF to lookupCustomer normally', async () => {
    const customer = { id: 'c2', name: 'Maria', status: 'active' };
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer,
      method: 'cpf',
      cpfUsed: '04976301338',
      attempts: ['phone', 'cpf'],
    });

    const result = await executeTool('buscar_cliente', { phone: PHONE, cpf: '049.763.013-38' }, PHONE);

    expect(lookupCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ cpfFromMessage: '04976301338' }),
    );
    expect(result).toEqual(customer);
  });
});

describe('executeTool — transferir_humano', () => {
  it('calls setHumanMode(phone, true) and returns confirmation', async () => {
    (setHumanMode as jest.Mock).mockResolvedValue(undefined);

    const result = await executeTool('transferir_humano', { reason: 'Cliente solicitou' }, PHONE);

    expect(setHumanMode).toHaveBeenCalledWith(PHONE, true, expect.any(String));
    expect(result).toMatchObject({ status: 'transferred' });
  });
});

describe('executeTool — verificar_cobertura', () => {
  it('returns covered=true for Jardim Guanabara', async () => {
    const result = await executeTool('verificar_cobertura', { neighborhood: 'Jardim Guanabara' }, PHONE);
    expect(result).toMatchObject({ covered: true });
  });

  it('returns covered=false for unknown neighborhood', async () => {
    const result = await executeTool('verificar_cobertura', { neighborhood: 'Meireles' }, PHONE);
    expect(result).toMatchObject({ covered: false });
  });
});

describe('executeTool — marcar_churn_risk', () => {
  it('upserts churn_risk=true on conversation_threads', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ upsert: mockUpsert });

    await executeTool(
      'marcar_churn_risk',
      { customer_id: 'c1', reason: 'Reclamações recorrentes' },
      PHONE,
      'salesnet-default',
    );

    expect(mockUpsert).toHaveBeenCalledWith(
      { phone: PHONE, tenant_id: 'salesnet-default', churn_risk: true },
      { onConflict: 'tenant_id,phone' },
    );
  });
});

describe('executeTool — solicitar_upgrade', () => {
  it('returns queued status without calling SGP', async () => {
    const result = await executeTool('solicitar_upgrade', { customer_id: 'c1', new_plan: '100Mbps' }, PHONE);
    expect(result).toMatchObject({ status: 'queued' });
  });
});

describe('executeTool — aplicar_cortesia', () => {
  it('returns queued status without calling SGP', async () => {
    const result = await executeTool('aplicar_cortesia', { customer_id: 'c1', reason: 'Instabilidade' }, PHONE);
    expect(result).toMatchObject({ status: 'queued' });
  });
});

describe('executeTool — detectar_apagao_bairro', () => {
  it('returns outage true when 2+ reports in last 2h', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockResolvedValue({ data: [{ id: '1' }, { id: '2' }], error: null }),
    });

    const result = await executeTool('detectar_apagao_bairro', { bairro: 'Jardim Iracema' }, PHONE);
    expect(result).toMatchObject({ outage: true, count: 2 });
  });

  it('returns outage false when fewer than 2 reports', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockResolvedValue({ data: [{ id: '1' }], error: null }),
    });

    const result = await executeTool('detectar_apagao_bairro', { bairro: 'Quintino Cunha' }, PHONE);
    expect(result).toMatchObject({ outage: false, count: 1 });
  });
});

describe('executeTool — confirmar_pagamento', () => {
  it('returns paid true when invoice status is paid', async () => {
    (sgp.getCustomerInvoices as jest.Mock).mockResolvedValue([{ id: 'inv1', status: 'paid', amount: 90 }]);

    const result = await executeTool('confirmar_pagamento', { invoice_id: 'inv1' }, PHONE);
    expect(result).toEqual({ paid: true, status: 'paid' });
  });

  it('returns paid false when invoice status is open', async () => {
    (sgp.getCustomerInvoices as jest.Mock).mockResolvedValue([{ id: 'inv1', status: 'open', amount: 90 }]);

    const result = await executeTool('confirmar_pagamento', { invoice_id: 'inv1' }, PHONE);
    expect(result).toEqual({ paid: false, status: 'open' });
  });
});

describe('executeTool — registrar_negociacao', () => {
  it('inserts negotiation record and returns confirmation', async () => {
    mockFrom.mockReturnValue({
      insert: jest.fn().mockResolvedValue({ error: null }),
    });

    const result = await executeTool(
      'registrar_negociacao',
      { customer_id: 'c1', condicoes: 'entrada 50% hoje, restante em 15 dias' },
      PHONE
    );
    expect(result).toMatchObject({ status: 'registered' });
  });
});

describe('executeTool — salvar_cpf_cliente (phone↔CPF binding guard)', () => {
  beforeEach(() => {
    (sgp.getContratoPhonesByCpf as jest.Mock).mockReset().mockResolvedValue([]);
  });

  it('persists the cpf when the session phone is registered to it in the SGP (normal case)', async () => {
    (sgp.getContratoPhonesByCpf as jest.Mock).mockResolvedValue([PHONE]);
    (sgp.getCustomerByCpf as jest.Mock).mockResolvedValue({ id: 'c1', name: 'João Silva' });

    const result = await executeTool('salvar_cpf_cliente', { cpf: '049.763.013-38' }, PHONE);

    expect(persistThreadCpf).toHaveBeenCalledWith(PHONE, expect.any(String), '04976301338');
    expect(result).toEqual({
      success: true,
      customer_found: true,
      customer: { id: 'c1', name: 'João Silva' },
    });
  });

  it('blocks persistence when the session phone has no verified link to the CPF (IDOR guard)', async () => {
    (sgp.getContratoPhonesByCpf as jest.Mock).mockResolvedValue(['+5585997761756']);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await executeTool('salvar_cpf_cliente', { cpf: '621.478.243-99' }, PHONE);

    expect(persistThreadCpf).not.toHaveBeenCalled();
    expect(sgp.getCustomerByCpf).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      cpf_binding_rejected: true,
      error: expect.any(String),
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cpf_binding_rejected'));
    warnSpy.mockRestore();
  });

  it('reproduces the Thiago/*3833 production case: real third-party CPF is rejected, not linked', async () => {
    // Thiago's real CPF, registered in the SGP only to his own phone — not *3833's.
    (sgp.getContratoPhonesByCpf as jest.Mock).mockResolvedValue(['+5585997761756']);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await executeTool('salvar_cpf_cliente', { cpf: '621.478.243-99' }, '+558591993833');

    expect(persistThreadCpf).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, cpf_binding_rejected: true });
    warnSpy.mockRestore();
  });

  it('rejects a checksum-invalid cpf before ever checking phone binding', async () => {
    const result = await executeTool('salvar_cpf_cliente', { cpf: '000.000.000-00' }, PHONE);

    expect(sgp.getContratoPhonesByCpf).not.toHaveBeenCalled();
    expect(persistThreadCpf).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: 'CPF inválido. Verifique os dígitos e tente novamente.' });
  });

  it('returns customer_found=false when a verified cpf has no active SGP contract', async () => {
    (sgp.getContratoPhonesByCpf as jest.Mock).mockResolvedValue([PHONE]);
    (sgp.getCustomerByCpf as jest.Mock).mockRejectedValue(new Error('Cliente não encontrado'));

    const result = await executeTool('salvar_cpf_cliente', { cpf: '049.763.013-38' }, PHONE);

    expect(persistThreadCpf).toHaveBeenCalled();
    expect(result).toEqual({ success: true, customer_found: false });
  });
});

describe('executeTool — listar_chamados_sofia (session-scoped contrato)', () => {
  const SESSION_CUSTOMER = { id: 'c1', name: 'João Silva', status: 'active' as const };

  it('uses the session-identified contrato when it matches the one requested (no behavior change)', async () => {
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: SESSION_CUSTOMER, method: 'phone', attempts: ['phone'],
    });
    const builder = buildQueryMock({
      data: [{ id: 't1', tipo: 'tecnico', descricao: 'sem sinal', status: 'aberto', created_at: '2026-01-01T00:00:00Z', sgp_chamado_id: null }],
      error: null,
    });
    mockFrom.mockReturnValue(builder);

    const result = await executeTool('listar_chamados_sofia', { contrato: 'c1' }, PHONE);

    expect((builder.eq as jest.Mock)).toHaveBeenCalledWith('contrato', 'c1');
    expect(result).toMatchObject({ total: 1 });
  });

  it('ignores an arbitrary/foreign contrato and queries the session-resolved one instead (IDOR guard)', async () => {
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: SESSION_CUSTOMER, method: 'phone', attempts: ['phone'],
    });
    const builder = buildQueryMock({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await executeTool('listar_chamados_sofia', { contrato: 'contrato-de-outro-cliente' }, PHONE);

    expect((builder.eq as jest.Mock)).toHaveBeenCalledWith('contrato', 'c1');
    expect((builder.eq as jest.Mock)).not.toHaveBeenCalledWith('contrato', 'contrato-de-outro-cliente');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cross-contrato attempt'));
    warnSpy.mockRestore();
  });

  it('declines generically when the session itself cannot be identified', async () => {
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: { error: 'Cliente não encontrado' }, method: null, attempts: ['phone'],
    });

    const result = await executeTool('listar_chamados_sofia', { contrato: 'contrato-de-outro-cliente' }, PHONE);

    expect(result).toMatchObject({ total: 0, chamados: [] });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('executeTool — abrir_chamado (session-scoped contrato)', () => {
  const SESSION_CUSTOMER = { id: 'c1', name: 'João Silva', status: 'active' as const };

  beforeEach(() => {
    (sgp.openTicket as jest.Mock).mockReset().mockResolvedValue({ protocolo: 'p1' });
    (sgp.getCustomerById as jest.Mock).mockReset().mockRejectedValue(new Error('not needed for this test'));
    mockFrom.mockReturnValue(buildQueryMock({ data: null, error: null }));
  });

  it('opens the ticket against the session-identified contrato when it matches the one requested', async () => {
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: SESSION_CUSTOMER, method: 'phone', attempts: ['phone'],
    });

    await executeTool('abrir_chamado', { contrato: 'c1', tipo: 'financeiro', descricao: 'fatura duplicada' }, PHONE);

    expect(sgp.openTicket).toHaveBeenCalledWith('c1', 'financeiro', 'fatura duplicada');
  });

  it('ignores an arbitrary/foreign contrato and opens the ticket against the session-resolved one instead (IDOR guard)', async () => {
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: SESSION_CUSTOMER, method: 'phone', attempts: ['phone'],
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await executeTool(
      'abrir_chamado',
      { contrato: 'contrato-de-outro-cliente', tipo: 'financeiro', descricao: 'fatura duplicada' },
      PHONE,
    );

    expect(sgp.openTicket).toHaveBeenCalledWith('c1', 'financeiro', 'fatura duplicada');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cross-contrato attempt'));
    warnSpy.mockRestore();
  });

  it('declines generically when the session itself cannot be identified', async () => {
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: { error: 'Cliente não encontrado' }, method: null, attempts: ['phone'],
    });

    const result = await executeTool(
      'abrir_chamado',
      { contrato: 'contrato-de-outro-cliente', tipo: 'financeiro', descricao: 'fatura duplicada' },
      PHONE,
    );

    expect(sgp.openTicket).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false });
  });
});

describe('executeTool — agendar_visita (session-scoped customer_id + contactPhone)', () => {
  const SESSION_CUSTOMER = { id: 'c1', name: 'João Silva', status: 'active' as const };

  beforeEach(() => {
    (sgp.scheduleVisit as jest.Mock).mockReset().mockResolvedValue(undefined);
    (sgp.getCustomerById as jest.Mock).mockReset();
    mockRpc.mockReset();
  });

  it('books against the session-identified customer_id when it matches the one requested', async () => {
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: SESSION_CUSTOMER, method: 'phone', attempts: ['phone'],
    });
    (sgp.getCustomerById as jest.Mock).mockResolvedValue({
      id: 'c1', name: 'João Silva', status: 'active', phone: '+5585911112222',
      address: { street: 'Rua A', number: '10' },
    });
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });

    await executeTool(
      'agendar_visita',
      { customer_id: 'c1', date: '2026-08-10', period: 'morning' },
      PHONE,
    );

    expect(sgp.scheduleVisit).toHaveBeenCalledWith('c1', '2026-08-10', 'morning');
    expect(mockRpc).toHaveBeenCalledWith('book_visit_slot', expect.objectContaining({
      p_contrato: 'c1',
      p_phone: '+5585911112222', // target contract's own registered phone, not the session's
    }));
  });

  it('ignores an arbitrary/foreign customer_id and books against the session-resolved one instead (IDOR guard)', async () => {
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: SESSION_CUSTOMER, method: 'phone', attempts: ['phone'],
    });
    (sgp.getCustomerById as jest.Mock).mockResolvedValue({
      id: 'c1', name: 'João Silva', status: 'active', phone: '',
      address: { street: 'Rua A', number: '10' },
    });
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await executeTool(
      'agendar_visita',
      { customer_id: 'contrato-de-outro-cliente', date: '2026-08-10', period: 'morning' },
      PHONE,
    );

    expect(sgp.scheduleVisit).toHaveBeenCalledWith('c1', '2026-08-10', 'morning');
    // Target contrato (== session's own) has no phone on file in this test — falling
    // back to the session's own WhatsApp phone is safe here because customer_id can
    // never diverge from the session anymore.
    expect(mockRpc).toHaveBeenCalledWith('book_visit_slot', expect.objectContaining({
      p_contrato: 'c1',
      p_phone: PHONE,
    }));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cross-contrato attempt'));
    warnSpy.mockRestore();
  });

  it('declines generically when the session itself cannot be identified', async () => {
    (lookupCustomer as jest.Mock).mockResolvedValue({
      customer: { error: 'Cliente não encontrado' }, method: null, attempts: ['phone'],
    });

    const result = await executeTool(
      'agendar_visita',
      { customer_id: 'contrato-de-outro-cliente', date: '2026-08-10', period: 'morning' },
      PHONE,
    );

    expect(sgp.scheduleVisit).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false });
  });
});
