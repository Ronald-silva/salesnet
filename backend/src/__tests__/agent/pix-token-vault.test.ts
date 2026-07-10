import { createPixTokenVault } from '../../agent/pix-token-vault';

const RAW_PIX =
  '00020126580014BR.GOV.BCB.PIX0136aaaabbbb-cccc-dddd-eeee-ffff000011115204000053039865802BR5913SALESNET6009FORTALEZA62070503***6304ABCD';
const RAW_PIX_2 =
  '00020126580014BR.GOV.BCB.PIX0136bbbbcccc-dddd-eeee-ffff-000011112222520400005303986540515.005802BR5913SALESNET6009FORTALEZA62070503***63041234';
const PLACEHOLDER_SHAPE = /^\{\{PIX_[0-9a-f]{8}\}\}$/;

describe('PixTokenVault.tokenize', () => {
  it('replaces a top-level pixKey with an opaque placeholder', () => {
    const vault = createPixTokenVault();
    const out = vault.tokenize({ invoiceId: '9001', pixKey: RAW_PIX });
    expect(out.pixKey).toMatch(PLACEHOLDER_SHAPE);
    expect(JSON.stringify(out)).not.toContain(RAW_PIX);
    expect(out.invoiceId).toBe('9001');
  });

  it('recurses into arrays and nested objects (listar_faturas / suggested_invoice)', () => {
    const vault = createPixTokenVault();
    const out = vault.tokenize({
      requires_disambiguation: true,
      suggested_invoice: { id: '1', pixCode: RAW_PIX },
      invoices: [{ id: '2', pixCode: RAW_PIX_2 }, { id: '3' }],
    });
    expect((out.suggested_invoice as { pixCode: string }).pixCode).toMatch(PLACEHOLDER_SHAPE);
    expect((out.invoices as Array<{ pixCode?: string }>)[0]!.pixCode).toMatch(PLACEHOLDER_SHAPE);
    expect(JSON.stringify(out)).not.toContain('000201');
  });

  it('returns the same token for the same code seen twice in one turn', () => {
    const vault = createPixTokenVault();
    const a = vault.tokenize({ pixKey: RAW_PIX });
    const b = vault.tokenize({ pixCode: RAW_PIX });
    expect(a.pixKey).toBe(b.pixCode);
    expect(vault.size()).toBe(1);
  });

  it('does not touch non-PIX fields, non-string values, or the original input object', () => {
    const vault = createPixTokenVault();
    const input = { pixKey: RAW_PIX, note: '000201 é só um número aqui', amount: 5 };
    const out = vault.tokenize(input);
    expect(out.note).toBe(input.note);
    expect(out.amount).toBe(5);
    expect(input.pixKey).toBe(RAW_PIX); // input não mutado
  });
});

describe('PixTokenVault.resolve', () => {
  it('substitutes a known placeholder with the real code', () => {
    const vault = createPixTokenVault();
    const { pixKey } = vault.tokenize({ pixKey: RAW_PIX });
    const res = vault.resolve(`Aqui está seu PIX:\n${pixKey}`);
    expect(res.ok).toBe(true);
    expect(res.substituted).toBe(1);
    expect(res.text).toContain(RAW_PIX);
    expect(res.text).not.toContain('{{PIX_');
  });

  it('tolerates inner whitespace and uppercase hex copied by the LLM', () => {
    const vault = createPixTokenVault();
    const { pixKey } = vault.tokenize({ pixKey: RAW_PIX });
    const id = (pixKey as string).slice(6, 14);
    const res = vault.resolve(`PIX: {{ PIX_${id.toUpperCase()} }}`);
    expect(res.ok).toBe(true);
    expect(res.text).toContain(RAW_PIX);
  });

  it('flags a placeholder that was never issued this turn (ok=false)', () => {
    const vault = createPixTokenVault();
    const res = vault.resolve('Segue: {{PIX_deadbeef}}');
    expect(res.ok).toBe(false);
    expect(res.unknownTokens).toEqual(['{{PIX_deadbeef}}']);
  });

  it('flags a malformed leftover token without braces (ok=false)', () => {
    const vault = createPixTokenVault();
    const res = vault.resolve('Segue: PIX_deadbeef');
    expect(res.ok).toBe(false);
    expect(res.malformedLeftover).toBe(true);
  });

  it('passes plain text through untouched (ok=true, substituted=0)', () => {
    const vault = createPixTokenVault();
    const res = vault.resolve('Sua fatura vence dia 15, tudo certo?');
    expect(res).toMatchObject({ ok: true, substituted: 0, unknownTokens: [] });
    expect(res.text).toBe('Sua fatura vence dia 15, tudo certo?');
  });
});
