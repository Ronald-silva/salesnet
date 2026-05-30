import Groq from 'groq-sdk';
import { env } from '../config/env';
import type { DecryptedMedia } from '../integrations/whatsapp/media-download';

let groq: Groq | null = null;

function getGroqClient(): Groq {
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured');
  if (!groq) groq = new Groq({ apiKey: env.GROQ_API_KEY });
  return groq;
}

/** Extensão de arquivo compatível com o Whisper a partir do mimetype. */
function audioExtension(mimetype: string): string {
  if (/mp4|m4a|aac/.test(mimetype)) return 'm4a';
  if (/mpeg|mp3/.test(mimetype)) return 'mp3';
  if (/wav/.test(mimetype)) return 'wav';
  if (/webm/.test(mimetype)) return 'webm';
  return 'ogg';
}

/** Transcreve áudio já baixado e descriptografado via Groq Whisper. */
export async function transcribeAudio(media: DecryptedMedia): Promise<string> {
  if (!env.GROQ_API_KEY) return '[transcrição indisponível: GROQ_API_KEY ausente]';
  try {
    const ext = audioExtension(media.mimetype);
    const file = new File([new Uint8Array(media.buffer)], `audio.${ext}`, {
      type: media.mimetype || 'audio/ogg',
    });
    const transcription = (await getGroqClient().audio.transcriptions.create({
      file,
      model: 'whisper-large-v3-turbo',
      language: 'pt',
      response_format: 'text',
    })) as unknown as string;
    return transcription.trim();
  } catch (err) {
    console.warn('[transcribe] audio transcription failed:', err);
    return '[áudio não transcrito]';
  }
}
