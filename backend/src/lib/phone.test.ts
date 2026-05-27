import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('normalizes number already in E.164 with +55', () => {
    expect(normalizePhone('+55 85 99199-3833')).toBe('+5585991993833');
  });

  it('normalizes number with 55 prefix but no plus sign', () => {
    expect(normalizePhone('5585991993833')).toBe('+5585991993833');
  });

  it('normalizes local mobile number with 9th digit', () => {
    expect(normalizePhone('(85) 99199-3833')).toBe('+5585991993833');
  });

  it('normalizes WhatsApp JID', () => {
    expect(normalizePhone('5585991993833@s.whatsapp.net')).toBe('+5585991993833');
  });
});
