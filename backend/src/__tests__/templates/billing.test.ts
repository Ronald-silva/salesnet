import { BILLING_TEMPLATE_DEFS } from '../../templates/billing';

describe('BILLING_TEMPLATE_DEFS — PIX best-effort', () => {
  const cases: Array<[keyof typeof BILLING_TEMPLATE_DEFS, Record<string, string>]> = [
    ['billing_reminder_d3', { nome: 'Ana', valor: '90.00', data_vencimento: '2026-07-13', chave_pix: 'pix-abc' }],
    ['billing_reminder_d0', { nome: 'Ana', valor: '90.00', chave_pix: 'pix-abc' }],
    ['billing_overdue_d3', { nome: 'Ana', valor: '90.00', chave_pix: 'pix-abc' }],
    ['billing_suspended_d5', { nome: 'Ana', valor: '90.00', chave_pix: 'pix-abc' }],
  ];

  it.each(cases)('%s includes the PIX line when chave_pix is present', (name, vars) => {
    const msg = BILLING_TEMPLATE_DEFS[name](vars);
    expect(msg).toContain('pix-abc');
  });

  it.each(cases)('%s omits the PIX line entirely when chave_pix is empty (best-effort, never blocks the message)', (name, vars) => {
    const msg = BILLING_TEMPLATE_DEFS[name]({ ...vars, chave_pix: '' });
    expect(msg).not.toMatch(/pix/i);
    expect(msg).not.toContain('``');
    expect(msg.length).toBeGreaterThan(0);
  });
});
