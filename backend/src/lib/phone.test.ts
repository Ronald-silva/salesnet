import {
  collectWebhookJidCandidates,
  isSendableWhatsAppTarget,
  lidThreadKey,
  phoneFromWhatsAppJid,
  resolveWebhookContact,
  toWhatsAppSendJid,
} from './phone';

describe('resolveWebhookContact', () => {
  it('resolves phone from standard JID', () => {
    const result = resolveWebhookContact(
      { Sender: '5585991993833@s.whatsapp.net' },
      {},
    );
    expect(result.fromPhone).toBe('+5585991993833');
    expect(result.replyJid).toBe('5585991993833@s.whatsapp.net');
  });

  it('resolves phone from SenderAlt when Sender is LID', () => {
    const result = resolveWebhookContact(
      {
        Sender: '218923106434420@lid',
        SenderAlt: '5585991993833@s.whatsapp.net',
      },
      {},
    );
    expect(result.fromPhone).toBe('+5585991993833');
    expect(result.replyJid).toBe('218923106434420@lid');
  });

  it('falls back to lid thread key when only LID is available', () => {
    const result = resolveWebhookContact(
      { Sender: '218923106434420@lid' },
      {},
    );
    expect(result.fromPhone).toBe('lid:218923106434420');
    expect(result.replyJid).toBe('218923106434420@lid');
  });

  it('reads senderPn from nested key', () => {
    const result = resolveWebhookContact(
      { Sender: '218923106434420@lid' },
      { key: { senderPn: '5585888887777@s.whatsapp.net' } },
    );
    expect(result.fromPhone).toBe('+5585888887777');
  });
});

describe('toWhatsAppSendJid', () => {
  it('builds JID for LID thread key', () => {
    expect(toWhatsAppSendJid('lid:218923106434420')).toBe('218923106434420@lid');
  });

  it('builds JID for BR phone', () => {
    expect(toWhatsAppSendJid('+5585991993833')).toBe('5585991993833@s.whatsapp.net');
  });
});

describe('isSendableWhatsAppTarget', () => {
  it('accepts lid thread keys', () => {
    expect(isSendableWhatsAppTarget('lid:218923106434420')).toBe(true);
  });
});

describe('collectWebhookJidCandidates', () => {
  it('deduplicates JIDs', () => {
    const list = collectWebhookJidCandidates(
      { Sender: '5585991993833@s.whatsapp.net', Chat: '5585991993833@s.whatsapp.net' },
      {},
    );
    expect(list).toHaveLength(1);
  });
});

describe('lidThreadKey', () => {
  it('extracts local part', () => {
    expect(lidThreadKey('218923106434420@lid')).toBe('lid:218923106434420');
  });
});

describe('phoneFromWhatsAppJid', () => {
  it('returns null for LID JID', () => {
    expect(phoneFromWhatsAppJid('218923106434420@lid')).toBeNull();
  });
});
