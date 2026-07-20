jest.mock('../../config/env', () => ({
  env: {
    DEFAULT_TENANT_ID: 'default',
    SGP_BASE_URL: 'https://example.com',
    SGP_API_TOKEN: 'x',
    SGP_APP_NAME: 'test',
    SUPABASE_URL: 'https://example.com',
    SUPABASE_SERVICE_ROLE_KEY: 'x',
    NODE_ENV: 'test',
  },
}));

jest.mock('../../integrations/sgp/customers', () => ({
  getCustomerByPhone: jest.fn().mockResolvedValue({ error: 'not found' }),
}));

jest.mock('../../agent/memory', () => ({
  getThread: jest.fn(),
}));

jest.mock('../../agent/customer-lookup', () => ({
  lookupCustomer: jest.fn(),
}));

import { quickReply } from '../../agent/quick-reply';
import { getThread } from '../../agent/memory';
import { lookupCustomer } from '../../agent/customer-lookup';

const mockedGetThread = getThread as jest.Mock;
const mockedLookupCustomer = lookupCustomer as jest.Mock;

const EMPTY_THREAD = {
  id: 't1', phone: '', messages: [], human_mode: false, churn_risk: false,
  created_at: '', updated_at: '',
};

describe('quickReply', () => {
  beforeEach(() => {
    // Default: sem histórico e cliente não encontrado — mesmo comportamento que os
    // testes abaixo já esperavam antes de plans_list passar a usar getThread/lookupCustomer.
    mockedGetThread.mockReset().mockResolvedValue(EMPTY_THREAD);
    mockedLookupCustomer.mockReset().mockResolvedValue({
      customer: { error: 'not found' }, method: null, attempts: [], phoneLinked: false,
    });
  });

  it('returns plans list for plan / mbps questions', async () => {
    const reply = await quickReply('me passa os planos disponíveis', '+5585888888888', 'test-tenant');
    expect(reply).toContain('500 Mega');
    expect(reply).toContain('Planos de fibra');
  });

  it('returns plans for "quero o plano de 500mb"', async () => {
    const reply = await quickReply('querop o plano de 500mb', '+5585888888888', 'test-tenant');
    expect(reply).toContain('500 Mega');
  });

  it('returns coverage list for bairros atendidos', async () => {
    const reply = await quickReply('quais bairros vocês atendem?', '+5585999999999', 'test-tenant');
    expect(reply).toContain('Bairros com cobertura');
    expect(reply).toContain('Jardim Guanabara');
  });

  it('returns installation FAQ only for generic taxa/prazo questions', async () => {
    const reply = await quickReply('quanto tempo demora a instalação?', '+5585999999999', 'test-tenant');
    expect(reply).toContain('taxa de instalação');
    expect(reply).toContain('roteador');
  });

  it('delegates scheduling questions to LLM', async () => {
    expect(await quickReply('quero a instalacao para amanha a tarde', '+5585999999999', 'test-tenant')).toBeNull();
  });

  it('delegates installation status to LLM', async () => {
    expect(await quickReply('minha instalacao esta agendada?', '+5585999999999', 'test-tenant')).toBeNull();
  });

  it('plans_list: fresh prospect with no thread history and no CPF still gets the static list', async () => {
    const reply = await quickReply('quais planos vocês têm?', '+5585900000012', 'test-tenant');
    expect(reply).toContain('Planos de fibra');
  });

  it('plans_list: does not repeat the static list once already shown in this thread (loop fix)', async () => {
    const firstReply = await quickReply('quais planos vocês têm?', '+5585900000010', 'test-tenant');
    expect(firstReply).toContain('Planos de fibra');

    mockedGetThread.mockResolvedValue({
      ...EMPTY_THREAD,
      messages: [
        { role: 'user', content: 'quais planos vocês têm?', timestamp: 't1' },
        { role: 'assistant', content: firstReply as string, timestamp: 't2' },
      ],
    });
    const secondReply = await quickReply('quais os planos de novo? tem de 500 mega?', '+5585900000010', 'test-tenant');
    expect(secondReply).toBeNull();
  });

  it('plans_list: customer identifiable only by CPF in the message defers to LLM instead of the prospect list', async () => {
    mockedLookupCustomer.mockResolvedValue({
      customer: { id: '123', name: 'Cliente Real', document: '11144477735', plan: '500 Mega' } as any,
      method: 'cpf',
      cpfUsed: '11144477735',
      attempts: ['cpf:111***'],
      phoneLinked: false,
    });
    const reply = await quickReply('meu cpf é 111.444.777-35, quais planos vocês têm?', '+5585900000011', 'test-tenant');
    expect(reply).toBeNull();
  });

  it('coverage_list: fresh prospect with no CPF still gets the static neighborhood list', async () => {
    const reply = await quickReply('quais bairros vocês atendem?', '+5585900000020', 'test-tenant');
    expect(reply).toContain('Bairros com cobertura');
  });

  it('coverage_list: customer identified by phone defers to LLM instead of the static list', async () => {
    mockedLookupCustomer.mockResolvedValue({
      customer: { id: '456', name: 'Cliente Existente', document: '11144477735', plan: '500 Mega' } as any,
      method: 'phone',
      attempts: ['phone'],
      phoneLinked: true,
    });
    const reply = await quickReply('quais bairros vocês atendem?', '+5585900000021', 'test-tenant');
    expect(reply).toBeNull();
  });

  it('coverage_list: customer identifiable only by CPF in the message defers to LLM instead of the static list', async () => {
    mockedLookupCustomer.mockResolvedValue({
      customer: { id: '789', name: 'Cliente Real', document: '11144477735', plan: '500 Mega' } as any,
      method: 'cpf',
      cpfUsed: '11144477735',
      attempts: ['cpf:111***'],
      phoneLinked: false,
    });
    const reply = await quickReply('meu cpf é 111.444.777-35, quais bairros vocês atendem?', '+5585900000022', 'test-tenant');
    expect(reply).toBeNull();
  });

  it('coverage_check: fresh prospect with no CPF still gets the static coverage answer', async () => {
    const reply = await quickReply('tem cobertura no Jardim Guanabara?', '+5585900000030', 'test-tenant');
    expect(reply).toContain('Atendemos o Jardim Guanabara');
  });

  it('coverage_check: customer identified by phone defers to LLM instead of the static answer', async () => {
    mockedLookupCustomer.mockResolvedValue({
      customer: { id: '456', name: 'Cliente Existente', document: '11144477735', plan: '500 Mega' } as any,
      method: 'phone',
      attempts: ['phone'],
      phoneLinked: true,
    });
    const reply = await quickReply('tem cobertura no Jardim Guanabara?', '+5585900000031', 'test-tenant');
    expect(reply).toBeNull();
  });

  it('coverage_check: customer identifiable only by CPF in the message defers to LLM instead of the static answer', async () => {
    mockedLookupCustomer.mockResolvedValue({
      customer: { id: '789', name: 'Cliente Real', document: '11144477735', plan: '500 Mega' } as any,
      method: 'cpf',
      cpfUsed: '11144477735',
      attempts: ['cpf:111***'],
      phoneLinked: false,
    });
    const reply = await quickReply('meu cpf é 111.444.777-35, tem cobertura no Jardim Guanabara?', '+5585900000032', 'test-tenant');
    expect(reply).toBeNull();
  });
});
