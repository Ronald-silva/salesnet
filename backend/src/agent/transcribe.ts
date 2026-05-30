import Groq, { toFile } from 'groq-sdk';
import { env } from '../config/env';
import type { DecryptedMedia } from '../integrations/whatsapp/media-download';

let groq: Groq | null = null;

function getGroqClient(): Groq {
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured');
  if (!groq) groq = new Groq({ apiKey: env.GROQ_API_KEY });
  return groq;
}

function normalizeAudioMime(mimetype: string): string {
  const base = mimetype.split(';')[0]?.trim().toLowerCase();
  if (!base || base === 'application/octet-stream') return 'audio/ogg';
  return base;
}

/** Extensão de arquivo compatível com o Whisper a partir do mimetype. */
function audioExtension(mimetype: string): string {
  const base = normalizeAudioMime(mimetype);
  if (/mp4|m4a|aac/.test(base)) return 'm4a';
  if (/mpeg|mp3/.test(base)) return 'mp3';
  if (/wav/.test(base)) return 'wav';
  if (/webm/.test(base)) return 'webm';
  return 'ogg';
}

/** Transcreve áudio já baixado e descriptografado via Groq Whisper. */
export async function transcribeAudio(media: DecryptedMedia): Promise<string> {
  if (!env.GROQ_API_KEY) {
    console.warn('[transcribe] GROQ_API_KEY not configured');
    return '[transcrição indisponível: GROQ_API_KEY ausente]';
  }

  const mime = normalizeAudioMime(media.mimetype);
  const ext = audioExtension(mime);

  try {
    const file = await toFile(media.buffer, `audio.${ext}`, { type: mime });

    const transcription = (await getGroqClient().audio.transcriptions.create({
      file,
      model: 'whisper-large-v3',
      language: 'pt',
      response_format: 'text',
      temperature: 0,
      prompt:
        'Transcrição de cliente brasileiro em atendimento de provedor de internet. ' +
        'Fortaleza, Ceará. Bairros, planos, fibra, fatura, velocidade, igreja, cobertura.',
    })) as unknown as string;

    const text = transcription.trim();
    if (!text) {
      console.warn('[transcribe] empty transcription result');
      return '[áudio sem fala detectada]';
    }

    console.log(`[transcribe] ok (${media.buffer.length} bytes, ${mime}): ${text.slice(0, 160)}`);
    return text;
  } catch (err) {
    console.warn('[transcribe] audio transcription failed:', err);
    return '[áudio não transcrito]';
  }
}
