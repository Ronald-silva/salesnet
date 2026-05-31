import { detectMediaType, unwrapWhatsAppMessage } from '../../integrations/whatsapp/media-download';

describe('unwrapWhatsAppMessage', () => {
  it('unwraps viewOnceMessage to imageMessage', () => {
    const inner = {
      imageMessage: { URL: 'https://example.com/x.enc', mediaKey: 'abc' },
    };
    const wrapped = { viewOnceMessage: { message: inner } };
    expect(unwrapWhatsAppMessage(wrapped)).toEqual(inner);
    expect(detectMediaType(wrapped)?.type).toBe('image');
  });

  it('unwraps ephemeralMessage to audioMessage', () => {
    const inner = { audioMessage: { URL: 'https://example.com/a.enc' } };
    const wrapped = { ephemeralMessage: { message: inner } };
    expect(detectMediaType(wrapped)?.type).toBe('audio');
  });
});
