import { titleCaseName } from './format';

describe('titleCaseName', () => {
  it('converts an all-uppercase name to Title Case, lowercasing connectives', () => {
    expect(titleCaseName('CARLOS ALBERTO DA SILVA')).toBe('Carlos Alberto da Silva');
  });

  it('lowercases minor connectives (de/da/do/das/dos/e) but capitalizes the first word even if it is one', () => {
    expect(titleCaseName('JOSÉ DOS SANTOS E SILVA')).toBe('José dos Santos e Silva');
    expect(titleCaseName('da silva santos')).toBe('Da Silva Santos');
  });

  it('leaves an already Title Case name unchanged', () => {
    expect(titleCaseName('Carlos Alberto da Silva')).toBe('Carlos Alberto da Silva');
  });
});
