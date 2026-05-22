import { classifyMessageComplexity } from '../../agent/complexity-router';

describe('classifyMessageComplexity', () => {
  it('classifies legal / escalation cues as complex', () => {
    expect(classifyMessageComplexity('Vou acionar o Procon')).toBe('complex');
    expect(classifyMessageComplexity('Quero falar com meu advogado')).toBe('complex');
  });

  it('classifies short greetings and FAQ hints as simple', () => {
    expect(classifyMessageComplexity('Oi')).toBe('simple');
    expect(classifyMessageComplexity('Bom dia!')).toBe('simple');
    expect(classifyMessageComplexity('Quais os planos?')).toBe('simple');
  });

  it('defaults longer or ambiguous text to intermediate', () => {
    expect(classifyMessageComplexity('Minha internet caiu ontem à noite e ainda não voltou')).toBe('intermediate');
  });
});
