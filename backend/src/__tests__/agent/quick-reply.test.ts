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

import { quickReply } from '../../agent/quick-reply';

describe('quickReply', () => {
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
});
