import { formatOutgoingWhatsApp } from '../../agent/sanitize';

describe('formatOutgoingWhatsApp', () => {
  it('strips single and double asterisk markdown', () => {
    expect(formatOutgoingWhatsApp('Meu nome é *Sofia*, da *SalesNet*')).toBe(
      'Meu nome é Sofia, da SalesNet',
    );
    expect(formatOutgoingWhatsApp('Plano **500 Mega**')).toBe('Plano 500 Mega');
  });

  it('never touches PIX codes wrapped in backticks, even when two codes on the same message each contain a literal "***" EMV placeholder', () => {
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

  it('still strips bold markdown that happens to sit near a backtick-quoted code', () => {
    const code = '000201abc***9999';
    const result = formatOutgoingWhatsApp(`**Valor:** R$ 10,00\nCódigo: \`${code}\``);
    expect(result).toBe(`Valor: R$ 10,00\nCódigo: \`${code}\``);
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
