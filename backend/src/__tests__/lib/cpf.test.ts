import { normalizeCpf, isValidCpfLength, isValidCpf, extractCpfFromText, extractBareCpfWhenAsked, hasInvalidBareCpfCandidate } from '../../lib/cpf';

describe('normalizeCpf', () => {
  it('strips formatting', () => {
    expect(normalizeCpf('049.763.013-38')).toBe('04976301338');
  });
});

describe('isValidCpfLength', () => {
  it('accepts 11 digits', () => {
    expect(isValidCpfLength('04976301338')).toBe(true);
  });

  it('rejects short strings', () => {
    expect(isValidCpfLength('123')).toBe(false);
  });
});

describe('isValidCpf', () => {
  it('accepts a real CPF', () => {
    expect(isValidCpf('04976301338')).toBe(true);
    expect(isValidCpf('049.763.013-38')).toBe(true);
  });

  it('rejects all-same-digit CPFs', () => {
    expect(isValidCpf('00000000000')).toBe(false);
    expect(isValidCpf('11111111111')).toBe(false);
  });

  it('rejects CPF with wrong check digits', () => {
    expect(isValidCpf('04976301339')).toBe(false); // last digit wrong
    expect(isValidCpf('12345678901')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidCpf('1234')).toBe(false);
  });
});

describe('extractCpfFromText', () => {
  // Formatted CPF (dots/dashes/spaces)
  it('extracts formatted CPF with dots and dash', () => {
    expect(extractCpfFromText('049.763.013-38')).toBe('04976301338');
  });

  it('extracts formatted CPF embedded in sentence', () => {
    expect(extractCpfFromText('meu cpf é 049.763.013-38')).toBe('04976301338');
  });

  it('extracts formatted CPF with spaces', () => {
    expect(extractCpfFromText('049 763 013 38')).toBe('04976301338');
  });

  // Labeled bare CPF
  it('extracts CPF after "cpf:"', () => {
    expect(extractCpfFromText('CPF: 04976301338')).toBe('04976301338');
  });

  it('extracts CPF after "cpf " (space only)', () => {
    expect(extractCpfFromText('cpf 04976301338')).toBe('04976301338');
  });

  // Natural PT-BR patterns (previously failing)
  it('extracts CPF after "cpf é"', () => {
    expect(extractCpfFromText('meu cpf é 04976301338')).toBe('04976301338');
  });

  it('extracts CPF after "cpf e" (without accent)', () => {
    expect(extractCpfFromText('cpf e 04976301338')).toBe('04976301338');
  });

  it('extracts CPF after "cpf ="', () => {
    expect(extractCpfFromText('cpf=04976301338')).toBe('04976301338');
  });

  it('extracts CPF after "cpf numero"', () => {
    expect(extractCpfFromText('meu cpf numero 04976301338')).toBe('04976301338');
  });

  // Should NOT extract
  it('ignores bare 11-digit mobile numbers', () => {
    expect(extractCpfFromText('85991993833')).toBeNull();
  });

  it('ignores bare 11 digits with no CPF keyword', () => {
    expect(extractCpfFromText('ligue para 04976301338')).toBeNull();
  });
});

describe('extractBareCpfWhenAsked', () => {
  it('extracts bare CPF from short message', () => {
    expect(extractBareCpfWhenAsked('04976301338')).toBe('04976301338');
  });

  it('extracts CPF with short context (≤ 50 chars)', () => {
    expect(extractBareCpfWhenAsked('04976301338 obrigado')).toBe('04976301338');
    expect(extractBareCpfWhenAsked('sim, meu cpf e 04976301338')).toBe('04976301338');
    expect(extractBareCpfWhenAsked('04976301338 é meu número de cpf ok')).toBe('04976301338');
  });

  it('extracts a checksum-valid bare CPF regardless of message length', () => {
    const long = '04976301338 esse é o meu cpf que você pediu anteriormente';
    expect(long.trim().length).toBeGreaterThan(50);
    expect(extractBareCpfWhenAsked(long)).toBe('04976301338');
  });

  it('returns null when digits are not exactly 11', () => {
    expect(extractBareCpfWhenAsked('8599123456')).toBeNull();  // 10 digits
  });

  it('reproduces the original incident: bare CPF inside a 63-char natural sentence', () => {
    const message = 'ME DE A DATA EXATA DOS VENCIMENTOS DA FATURA DA:  02284204317';
    expect(message.trim().length).toBeGreaterThan(50);
    expect(isValidCpf('02284204317')).toBe(true);
    expect(extractBareCpfWhenAsked(message)).toBe('02284204317');
  });

  it('picks the checksum-valid CPF out of a long message that also contains an unrelated 11-digit phone number', () => {
    // 85991993833 is a plausible BR mobile number (11 digits) and fails the CPF
    // checksum; 04976301338 is a real, checksum-valid CPF. Both appear in the
    // same long sentence — only the valid one should be returned.
    expect(isValidCpf('85991993833')).toBe(false);
    const message = 'Meu telefone é 85991993833 e meu cpf é 04976301338, pode confirmar os dois please';
    expect(extractBareCpfWhenAsked(message)).toBe('04976301338');
  });

  it('returns null for a long message with no checksum-valid 11-digit sequence at all', () => {
    const message = 'Estou tentando entender minha fatura, pode me ajudar com isso hoje por gentileza';
    expect(extractBareCpfWhenAsked(message)).toBeNull();
  });

  it('rejects an 11-digit sequence with a bad checksum even inside a long sentence', () => {
    expect(isValidCpf('04976301339')).toBe(false); // last digit wrong (see isValidCpf tests above)
    const message = 'Aqui está meu documento para consulta: 04976301339, por favor verifique';
    expect(extractBareCpfWhenAsked(message)).toBeNull();
  });
});

describe('hasInvalidBareCpfCandidate', () => {
  it('is true when the message has an 11-digit run that looks like a CPF but fails checksum', () => {
    const message = 'Aqui está meu documento para consulta: 04976301339, por favor verifique';
    expect(hasInvalidBareCpfCandidate(message)).toBe(true);
  });

  it('is false when the message has no 11-digit run at all (ordinary conversation)', () => {
    const message = 'Estou tentando entender minha fatura, pode me ajudar com isso hoje por gentileza';
    expect(hasInvalidBareCpfCandidate(message)).toBe(false);
  });

  it('is false when the 11-digit run is actually a valid CPF', () => {
    const message = 'ME DE A DATA EXATA DOS VENCIMENTOS DA FATURA DA:  02284204317';
    expect(hasInvalidBareCpfCandidate(message)).toBe(false);
  });

  it('is false when every 11-digit run present is a valid CPF, even with multiple candidates', () => {
    const message = 'Meu telefone é 85991993833 e meu cpf é 04976301338'; // one invalid-checksum run, one valid
    // At least one candidate is valid, so this is NOT the ambiguous "looks like CPF but wrong" case.
    expect(hasInvalidBareCpfCandidate(message)).toBe(false);
  });
});
