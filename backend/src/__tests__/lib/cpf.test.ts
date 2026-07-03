import { normalizeCpf, isValidCpfLength, isValidCpf, extractCpfFromText, extractBareCpfWhenAsked } from '../../lib/cpf';

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

  it('returns null for message > 50 chars', () => {
    const long = '04976301338 esse é o meu cpf que você pediu anteriormente';
    expect(long.trim().length).toBeGreaterThan(50);
    expect(extractBareCpfWhenAsked(long)).toBeNull();
  });

  it('returns null when digits are not exactly 11', () => {
    expect(extractBareCpfWhenAsked('8599123456')).toBeNull();  // 10 digits
  });
});
