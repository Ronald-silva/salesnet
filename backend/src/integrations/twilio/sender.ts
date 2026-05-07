import { twilioClient } from './client';
import { env } from '../../config/env';

function toWhatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const e164 = digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
  return `whatsapp:${e164}`;
}

const FROM = `whatsapp:${env.TWILIO_WHATSAPP_NUMBER.startsWith('+') ? env.TWILIO_WHATSAPP_NUMBER : `+${env.TWILIO_WHATSAPP_NUMBER}`}`;

export async function sendMessage(to: string, body: string): Promise<void> {
  await twilioClient.messages.create({ from: FROM, to: toWhatsappNumber(to), body });
}

export async function sendTemplate(
  to: string,
  templateSid: string,
  variables: Record<string, string>,
): Promise<void> {
  await twilioClient.messages.create({
    from:             FROM,
    to:               toWhatsappNumber(to),
    contentSid:       templateSid,
    contentVariables: JSON.stringify(variables),
  } as Parameters<typeof twilioClient.messages.create>[0]);
}

export async function sendMediaMessage(to: string, body: string, mediaUrl: string): Promise<void> {
  await twilioClient.messages.create({
    from:     FROM,
    to:       toWhatsappNumber(to),
    body,
    mediaUrl: [mediaUrl],
  } as Parameters<typeof twilioClient.messages.create>[0]);
}
