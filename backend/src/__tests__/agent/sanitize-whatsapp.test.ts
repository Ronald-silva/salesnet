import { formatOutgoingWhatsApp, containsUnverifiedPix } from '../../agent/sanitize';

describe('formatOutgoingWhatsApp', () => {
  it('strips single and double asterisk markdown', () => {
    expect(formatOutgoingWhatsApp('Meu nome é *Sofia*, da *SalesNet*')).toBe(
      'Meu nome é Sofia, da SalesNet',
    );
    expect(formatOutgoingWhatsApp('Plano **500 Mega**')).toBe('Plano 500 Mega');
  });

  it('preserves PIX codes wrapped in backticks intact, even when two codes on the same message each contain a literal "***" EMV placeholder', () => {
    // Regression test for a real production incident: two PIX codes in one reply
    // (multi-invoice gerar_pix) each legitimately contain "***" (EMV tag 62 empty
    // txid placeholder). The old double-asterisk regex greedily paired a lone "*"
    // from the first code with a lone "*" from the second, deleting everything in
    // between — including 2 of each code's 3 asterisks — which breaks the fixed-width
    // EMV payload and invalidates the CRC16 trailer.
    const pix1 =
      '00020101021226900014br.gov.bcb.pix2568qrcodepix.bb.com.br/pix/v2/cobv/6b33bc5c-8016-4922-967c-b32d6bed3d81520400005303986540569.995802BR5925NEGOCIARIE COBRANCA E ASS6008BARRETOS62070503***63040357';
    const pix2 =
      '00020101021226900014br.gov.bcb.pix2568qrcodepix.bb.com.br/pix/v2/cobv/503cdc10-63cc-49b9-b6c9-6125b81d396f520400005303986540569.995802BR5925NEGOCIARIE COBRANCA E ASS6008BARRETOS62070503***63043388';
    const message =
      `Aqui estão os PIX das duas faturas:\n\n` +
      `1) Código PIX:\n\`${pix1}\`\n\n` +
      `2) Código PIX:\n\`${pix2}\``;

    const result = formatOutgoingWhatsApp(message);

    expect(result).toContain(pix1);
    expect(result).toContain(pix2);
  });

  it('strips the backticks themselves from the final message, so the customer never copies a stray literal backtick glued to the PIX payload', () => {
    // Single backtick has no special meaning on WhatsApp (it's not real markdown —
    // only triple backtick renders monospace) and shows up as a literal character.
    // If it survived into the outgoing text, copying the message would paste that
    // extra character stuck to the EMV payload and break the CRC16 checksum — the
    // same class of corruption the asterisk bug caused, reintroduced by an earlier
    // "fix" that preserved the backticks in the customer-facing text.
    const code = '00020101021226900014br.gov.bcb.pix2568qrcodepix.bb.com.br62070503***63040357';
    const result = formatOutgoingWhatsApp(`Aqui está o código:\n\`${code}\``);
    expect(result).toBe(`Aqui está o código:\n${code}`);
    expect(result).not.toContain('`');
  });

  it('still strips bold markdown that happens to sit near a backtick-quoted code', () => {
    const code = '000201abc***9999';
    const result = formatOutgoingWhatsApp(`**Valor:** R$ 10,00\nCódigo: \`${code}\``);
    expect(result).toBe(`Valor: R$ 10,00\nCódigo: ${code}`);
  });

  it('protects a raw PIX payload even without backticks, as a safety net if the LLM forgets to quote it', () => {
    const pix1 =
      '00020101021226900014br.gov.bcb.pix2568qrcodepix.bb.com.br/pix/v2/cobv/6b33bc5c-8016-4922-967c-b32d6bed3d81520400005303986540569.995802BR5925NEGOCIARIE COBRANCA E ASS6008BARRETOS62070503***63040357';
    const pix2 =
      '00020101021226900014br.gov.bcb.pix2568qrcodepix.bb.com.br/pix/v2/cobv/503cdc10-63cc-49b9-b6c9-6125b81d396f520400005303986540569.995802BR5925NEGOCIARIE COBRANCA E ASS6008BARRETOS62070503***63043388';
    const message =
      `Aqui estão os códigos:\n\n1) ${pix1}\n\n2) ${pix2}`;

    const result = formatOutgoingWhatsApp(message);

    expect(result).toContain(pix1);
    expect(result).toContain(pix2);
  });

  it('does not treat ordinary prose as a PIX payload just because it contains digits', () => {
    const text = '**Oi!** Seu plano custa R$ 79,99/mês e o CEP é 00020199, sem nenhum código PIX aqui.';
    const result = formatOutgoingWhatsApp(text);
    expect(result).toBe('Oi! Seu plano custa R$ 79,99/mês e o CEP é 00020199, sem nenhum código PIX aqui.');
  });
});

describe('containsUnverifiedPix', () => {
  const realPix =
    '00020101021226900014br.gov.bcb.pix2568qrcodepix.bb.com.br/pix/v2/cobv/6b33bc5c-8016-4922-967c-b32d6bed3d81520400005303986540569.995802BR5925NEGOCIARIE COBRANCA E ASS6008BARRETOS62070503***63040357';

  it('allows a PIX code that matches a gerar_pix call made in this turn', () => {
    const toolCallLog = [
      { name: 'gerar_pix', output: { invoiceId: 'inv-1', pixKey: realPix } },
    ];
    expect(containsUnverifiedPix(`Aqui está seu código:\n${realPix}`, toolCallLog)).toBe(false);
  });

  it('blocks a PIX-shaped code that has no matching gerar_pix call this turn', () => {
    // Regression: LLM hallucinated/misremembered a PIX from earlier in the
    // conversation history instead of calling gerar_pix again.
    expect(containsUnverifiedPix(`Aqui está seu código:\n${realPix}`, [])).toBe(true);
  });

  it('blocks a PIX-shaped code that does not exactly match the tool output (subtle corruption)', () => {
    const corrupted = realPix.replace('***', '*');
    const toolCallLog = [
      { name: 'gerar_pix', output: { invoiceId: 'inv-1', pixKey: realPix } },
    ];
    expect(containsUnverifiedPix(`Aqui está seu código:\n${corrupted}`, toolCallLog)).toBe(true);
  });

  it('blocks a PIX-shaped code when the only tool calls this turn are unrelated', () => {
    const toolCallLog = [
      { name: 'buscar_cliente', output: { id: 'cust-1' } },
      { name: 'listar_faturas', output: [{ id: 'inv-1' }] },
    ];
    expect(containsUnverifiedPix(`Aqui está seu código:\n${realPix}`, toolCallLog)).toBe(true);
  });

  it('allows text with no PIX-shaped content regardless of tool calls', () => {
    expect(containsUnverifiedPix('Sua fatura vence dia 10, valor R$ 79,99.', [])).toBe(false);
  });

  it('allows each of two PIX codes when both came from gerar_pix calls this turn', () => {
    const pix2 =
      '00020101021226900014br.gov.bcb.pix2568qrcodepix.bb.com.br/pix/v2/cobv/503cdc10-63cc-49b9-b6c9-6125b81d396f520400005303986540569.995802BR5925NEGOCIARIE COBRANCA E ASS6008BARRETOS62070503***63043388';
    const toolCallLog = [
      { name: 'gerar_pix', output: { invoiceId: 'inv-1', pixKey: realPix } },
      { name: 'gerar_pix', output: { invoiceId: 'inv-2', pixKey: pix2 } },
    ];
    const text = `1) ${realPix}\n\n2) ${pix2}`;
    expect(containsUnverifiedPix(text, toolCallLog)).toBe(false);
  });

  it('ignores gerar_pix calls that errored (no pixKey field) when verifying', () => {
    const toolCallLog = [
      { name: 'gerar_pix', output: { error: 'Nenhuma fatura em aberto encontrada.' } },
    ];
    expect(containsUnverifiedPix(`Aqui está seu código:\n${realPix}`, toolCallLog)).toBe(true);
  });
});
