/**
 * Canonical Brazilian phone normalization (E.164 with + prefix).
 *
 * Merged from legacy helpers:
 * - stripPhone: only stripped non-digits; now the first step after JID handling.
 * - auth normalizePhone: +55 for 10–11 digit local numbers; + prefix when already has country 55.
 * - jidToPhone: stripped @s.whatsapp.net (or any @suffix) before parsing; kept.
 * - toSgpPhone: stripped leading 55 for SGP API — callers use .replace(/^\+55/, '') on this output.
 */
/** BR WhatsApp: 55 + DDD (2) + número (8 ou 9) = 12 ou 13 dígitos. */
export function isValidBrazilWhatsAppDigits(digits: string): boolean {
  return /^55\d{10,11}$/.test(digits);
}

/** Mask phone number for LGPD-compliant logging: show only last 4 digits. */
export function maskPhone(phone: string): string {
  return phone.length > 4 ? `****${phone.slice(-4)}` : '****';
}

export function isLidJid(jid: string): boolean {
  return jid.includes('@lid');
}

/** Canais, broadcast e grupos — não são atendimento 1:1. */
export function isIgnorableWhatsAppJid(jid: string): boolean {
  const lower = jid.trim().toLowerCase();
  return (
    lower.endsWith('@newsletter') ||
    lower.endsWith('@broadcast') ||
    lower.endsWith('@g.us') ||
    lower.endsWith('@status')
  );
}

/** Chave estável para threads quando só há LID (sem telefone exposto). */
export function lidThreadKey(jid: string): string {
  const local = jid.replace(/@[^@]+$/, '').replace(/\D/g, '');
  return `lid:${local}`;
}

export function normalizePhone(raw: string): string {
  if (raw.startsWith('lid:')) return raw;

  const withoutJid = raw.replace(/@[^@]+$/, '');
  const digits = withoutJid.replace(/\D/g, '');
  if (!digits) return '+';

  if (digits.startsWith('55')) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}

/** E.164 (+55…) ou null se o JID/número não for um celular BR válido para WhatsApp. */
export function phoneFromWhatsAppJid(jid: string): string | null {
  if (isLidJid(jid)) return null;
  const digits = jid.replace(/@[^@]+$/, '').replace(/\D/g, '');
  if (!isValidBrazilWhatsAppDigits(digits)) return null;
  return `+${digits}`;
}

/** Dígitos BR (55…) para envio Evolution, ou null se inválido. */
export function toWhatsAppSendDigits(phone: string): string | null {
  if (phone.startsWith('lid:')) return phone.slice(4);
  const digits = normalizePhone(phone).replace(/\D/g, '');
  if (!isValidBrazilWhatsAppDigits(digits)) return null;
  return digits;
}

/** Destino válido para envio: celular BR ou contato LID. */
export function isSendableWhatsAppTarget(target: string): boolean {
  if (target.startsWith('lid:')) return target.length > 4;
  return toWhatsAppSendDigits(target) !== null;
}

/** JID para POST /send/text do Evolution Go. */
export function toWhatsAppSendJid(target: string): string | null {
  if (target.includes('@')) {
    return target.replace(/^\+/, '');
  }
  if (target.startsWith('lid:')) {
    const local = target.slice(4).replace(/\D/g, '');
    return local ? `${local}@lid` : null;
  }
  const digits = toWhatsAppSendDigits(target);
  return digits ? `${digits}@s.whatsapp.net` : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/** Coleta JIDs candidatos do payload Evolution Go / whatsmeow (inclui SenderAlt, senderPn). */
export function collectWebhookJidCandidates(
  info: Record<string, unknown>,
  data: Record<string, unknown>,
): string[] {
  const key = (data.key ?? data.Key) as Record<string, unknown> | undefined;
  const raw: Array<string | undefined> = [
    pickString(info, ['Sender', 'sender']),
    pickString(info, ['Chat', 'chat']),          // separado: @g.us deve entrar nos candidatos mesmo quando Sender existe
    pickString(info, ['SenderAlt', 'senderAlt', 'ChatAlt', 'chatAlt']),
    pickString(info, ['Participant', 'participant', 'ParticipantAlt', 'participantAlt']),
    pickString(data, ['Sender', 'sender']),
    pickString(data, ['Chat', 'chat']),
    key ? pickString(key, ['senderPn', 'SenderPn', 'remoteJidAlt', 'RemoteJidAlt']) : undefined,
    key ? pickString(key, ['remoteJid', 'RemoteJid', 'participant', 'Participant']) : undefined,
  ];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const jid of raw) {
    if (!jid || !jid.includes('@') || seen.has(jid)) continue;
    seen.add(jid);
    out.push(jid);
  }
  return out;
}

/**
 * Resolve contato do webhook: telefone E.164 quando disponível, ou lid:… para thread.
 * replyJid é o JID original para roteamento de resposta (@s.whatsapp.net ou @lid).
 */
export function resolveWebhookContact(
  info: Record<string, unknown>,
  data: Record<string, unknown>,
): { replyJid: string; fromPhone: string | undefined } {
  const candidates = collectWebhookJidCandidates(info, data);
  const primarySender =
    pickString(info, ['Sender', 'sender']) ??
    pickString(data, ['Sender', 'sender']) ??
    candidates[0] ??
    '';
  const replyJid = primarySender || candidates[0] || '';

  for (const jid of candidates) {
    const phone = phoneFromWhatsAppJid(jid);
    if (phone) return { replyJid, fromPhone: phone };
  }

  const lidJid = candidates.find(isLidJid);
  if (lidJid) {
    return { replyJid: lidJid, fromPhone: lidThreadKey(lidJid) };
  }

  return { replyJid, fromPhone: undefined };
}
