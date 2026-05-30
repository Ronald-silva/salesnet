import { isValidBrazilWhatsAppDigits, normalizePhone, phoneFromWhatsAppJid, toWhatsAppSendDigits } from './phone';

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

describe('isValidBrazilWhatsAppDigits', () => {
  it('accepts valid BR mobile', () => {
    expect(isValidBrazilWhatsAppDigits('5585991993833')).toBe(true);
  });

  it('rejects malformed long JID digits', () => {
    expect(isValidBrazilWhatsAppDigits('55120363284547575710')).toBe(false);
  });
});

describe('phoneFromWhatsAppJid', () => {
  it('returns E.164 for valid JID', () => {
    expect(phoneFromWhatsAppJid('5585991993833@s.whatsapp.net')).toBe('+5585991993833');
  });

  it('returns null for invalid JID', () => {
    expect(phoneFromWhatsAppJid('55120363284547575710@s.whatsapp.net')).toBeNull();
  });
});

describe('toWhatsAppSendDigits', () => {
  it('returns digits for valid phone', () => {
    expect(toWhatsAppSendDigits('+5585991993833')).toBe('5585991993833');
  });

  it('returns null for invalid phone', () => {
    expect(toWhatsAppSendDigits('55120363284547575710')).toBeNull();
  });
});
