jest.mock('../../integrations/sgp', () => ({
  getCustomerByPhone:  jest.fn(),
  getCurrentInvoice:   jest.fn(),
  generatePixKey:      jest.fn(),
  getCustomerTickets:  jest.fn(),
  openTicket:          jest.fn(),
  scheduleVisit:       jest.fn(),
  getConnectionStatus: jest.fn(),
  getCustomerById:     jest.fn(),
}));

jest.mock('../../agent/memory', () => ({
  setHumanMode: jest.fn(),
}));

const mockFrom = jest.fn();
jest.mock('../../config/supabase', () => ({
  supabase: { from: mockFrom },
}));

import { executeTool, TOOL_DEFINITIONS } from '../../agent/tools';
import * as sgp from '../../integrations/sgp';
import { setHumanMode } from '../../agent/memory';

const PHONE = '+5585999990000';

describe('TOOL_DEFINITIONS', () => {
  it('exports exactly 20 tools', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(20);
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
  it('calls getCustomerByPhone with the phone arg', async () => {
    const customer = { id: 'c1', name: 'João Silva', status: 'active' };
    (sgp.getCustomerByPhone as jest.Mock).mockResolvedValue(customer);

    const result = await executeTool('buscar_cliente', { phone: PHONE }, PHONE);
    expect(sgp.getCustomerByPhone).toHaveBeenCalledWith(PHONE);
    expect(result).toEqual(customer);
  });

  it('returns error object when customer not found', async () => {
    (sgp.getCustomerByPhone as jest.Mock).mockRejectedValue(new Error('Not found'));

    const result = await executeTool('buscar_cliente', { phone: PHONE }, PHONE);
    expect(result).toEqual({ error: 'Cliente não encontrado' });
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
    (sgp.getCurrentInvoice as jest.Mock).mockResolvedValue({ id: 'inv1', status: 'paid', amount: 90 });

    const result = await executeTool('confirmar_pagamento', { invoice_id: 'inv1' }, PHONE);
    expect(result).toEqual({ paid: true, status: 'paid' });
  });

  it('returns paid false when invoice status is open', async () => {
    (sgp.getCurrentInvoice as jest.Mock).mockResolvedValue({ id: 'inv1', status: 'open', amount: 90 });

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
