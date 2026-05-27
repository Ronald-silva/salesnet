import { quickReply } from '../../agent/quick-reply';

describe('quickReply', () => {
  it('returns plans when user asks for planos disponiveis', async () => {
    const reply = await quickReply('teria como me passa os planos disponiveis?', '+5585999999999');
    expect(reply).toContain('400 Mega');
    expect(reply).toContain('500 Mega');
    expect(reply).not.toContain('Bairros com cobertura');
  });

  it('returns plans for me passa os planos (uncadastrado)', async () => {
    const reply = await quickReply('me passa os planos disponíveis', '+5585888888888');
    expect(reply).toContain('400 Mega');
    expect(reply).not.toContain('Bairros com cobertura');
  });

  it('returns coverage list for bairros atendidos', async () => {
    const reply = await quickReply('quais bairros vocês atendem?', '+5585999999999');
    expect(reply).toContain('Bairros com cobertura');
    expect(reply).toContain('Jardim Guanabara');
  });
});
