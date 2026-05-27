import Groq from 'groq-sdk';
import axios from 'axios';
import { env } from '../config/env';

let groq: Groq | null = null;

function getGroqClient(): Groq {
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured');
  if (!groq) groq = new Groq({ apiKey: env.GROQ_API_KEY });
  return groq;
}

export async function transcribeAudio(audioUrl: string): Promise<string> {
  if (!env.GROQ_API_KEY) return '[transcrição indisponível: GROQ_API_KEY ausente]';
  try {
    const response = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 10_000 });
    const buffer = Buffer.from(response.data as ArrayBuffer);
    const file = new File([buffer], 'audio.ogg', { type: 'audio/ogg' });
    const transcription = await getGroqClient().audio.transcriptions.create({
      file,
      model: 'whisper-large-v3-turbo',
      language: 'pt',
      response_format: 'text',
    }) as unknown as string;
    return transcription.trim();
  } catch (err) {
    console.warn('[transcribe] audio transcription failed:', err);
    return '[áudio não transcrito]';
  }
}
