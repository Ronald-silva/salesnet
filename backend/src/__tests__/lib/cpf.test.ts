import { normalizeCpf, isValidCpfLength, extractCpfFromText } from '../../lib/cpf';

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

describe('extractCpfFromText', () => {
  it('extracts formatted CPF', () => {
    expect(extractCpfFromText('meu cpf é 049.763.013-38')).toBe('04976301338');
  });

  it('extracts CPF after label', () => {
    expect(extractCpfFromText('CPF: 04976301338')).toBe('04976301338');
  });

  it('ignores bare 11-digit mobile numbers', () => {
    expect(extractCpfFromText('85991993833')).toBeNull();
  });
});
