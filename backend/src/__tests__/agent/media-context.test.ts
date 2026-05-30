import {
  buildMediaMessageContext,
  extractVoiceTranscript,
  formatVoiceMessage,
} from '../../agent/media-context';

describe('media-context', () => {
  it('extracts voice transcript from new format', () => {
    expect(extractVoiceTranscript('(voz do cliente): "A igreja em Teixeira?"')).toBe(
      'A igreja em Teixeira?',
    );
  });

  it('extracts legacy [áudio] format', () => {
    expect(extractVoiceTranscript('[áudio] Boa noite')).toBe('Boa noite');
  });

  it('builds priority context for voice messages', () => {
    const ctx = buildMediaMessageContext('(voz do cliente): "Quero meu boleto"');
    expect(ctx).toContain('PRIORIDADE');
    expect(ctx).toContain('Quero meu boleto');
  });

  it('formatVoiceMessage escapes quotes', () => {
    expect(formatVoiceMessage('disse "oi"')).toBe('(voz do cliente): "disse \'oi\'"');
  });
});
