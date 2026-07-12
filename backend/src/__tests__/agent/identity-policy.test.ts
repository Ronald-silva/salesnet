jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { BUSINESS_INFO } from '../../agent/company-data';
import { buildIdentificationContext } from '../../agent/customer-lookup';
import { buildSystemPrompt } from '../../agent/skill/prompt-builder';
import { salesnetConfig } from '../../agent/skill/config-loader';

describe('Sofia identity and official-channel policy', () => {
  const unlinkedCpfLookup = {
    customer: { id: 'c1', name: 'Vanda', phone: '+5585999990000', status: 'active' as const },
    method: 'cpf' as const,
    cpfUsed: '04976301338',
    attempts: ['phone', 'cpf:049***'],
    phoneLinked: false,
  };

  it('continues common service after locating a CPF from a different WhatsApp', () => {
    const context = buildIdentificationContext(unlinkedCpfLookup, '+5585988887777');

    expect(context).toContain('Continue normalmente com orientações e atendimento');
    expect(context).toContain('Faturas, PIX e confirmação de pagamento estão autorizados temporariamente');
    expect(context).not.toMatch(/pertence a outro n[uú]mero|telefone antigo|atendimento bloqueado/i);
  });

  it('allows financial service but keeps account changes blocked for cpf-only identification', () => {
    const prompt = buildSystemPrompt(salesnetConfig);

    expect(prompt).toContain('faturas, PIX e confirmação de pagamento ficam autorizados temporariamente');
    expect(prompt).toContain('Continuam protegidos apenas com a posse do CPF');
    expect(prompt).toContain('alteração cadastral/telefone/titularidade/endereço');
  });

  it('uses only the official customer portal and human support number', () => {
    const prompt = buildSystemPrompt(salesnetConfig);

    expect(BUSINESS_INFO.customerPortalUrl).toBe('https://salesnet.sgp.tsmx.com.br/central');
    expect(BUSINESS_INFO.humanSupportPhone).toBe('(85) 98851-2753');
    expect(prompt).toContain(BUSINESS_INFO.customerPortalUrl);
    expect(prompt).toContain(BUSINESS_INFO.humanSupportPhone);
    expect(prompt).not.toContain(['https://salesnet.com.br', 'minha-conta'].join('/'));
  });
});
