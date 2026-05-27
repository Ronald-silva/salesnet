import { quickReply } from '../../agent/quick-reply';

describe('quickReply (intents parciais em produção)', () => {
  it('delegates planos to LLM while plans_list is disabled', async () => {
    const reply = await quickReply('me passa os planos disponíveis', '+5585888888888');
    expect(reply).toBeNull();
  });

  it('returns coverage list for bairros atendidos', async () => {
    const reply = await quickReply('quais bairros vocês atendem?', '+5585999999999');
    expect(reply).toContain('Bairros com cobertura');
    expect(reply).toContain('Jardim Guanabara');
  });

  it('returns installation FAQ when asked', async () => {
    const reply = await quickReply('quanto tempo demora a instalação?', '+5585999999999');
    expect(reply).toContain('taxa de instalação');
    expect(reply).toContain('roteador');
  });
});
