import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { env } from '../config/env';

let genai: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
  if (!genai) genai = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  return genai;
}

export interface PaymentProofResult {
  isPaymentProof: boolean;
  amount?: number;
  date?: string;
  beneficiary?: string;
  confidence: 'high' | 'low';
}

export async function analyzeImage(imageUrl: string): Promise<PaymentProofResult> {
  if (!env.GEMINI_API_KEY) {
    console.warn('[vision] GEMINI_API_KEY not configured — skipping image analysis');
    return { isPaymentProof: false, confidence: 'low' };
  }

  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10_000,
      headers: { apikey: env.EVOLUTION_INSTANCE_TOKEN },
    });

    const base64 = Buffer.from(response.data).toString('base64');
    const mimeType = (response.headers['content-type'] as string) ?? 'image/jpeg';

    const model = getGeminiClient().getGenerativeModel({
      model: 'gemini-2.0-flash',
    });

    const result = await model.generateContent([
      {
        inlineData: { data: base64, mimeType },
      },
      'Esta imagem é um comprovante de pagamento ou transferência bancária? ' +
        'Se sim, extraia: valor em reais, data, nome do beneficiário. ' +
        'Responda APENAS com JSON no formato: ' +
        '{"isPaymentProof":bool,"amount":number|null,"date":"string|null",' +
        '"beneficiary":"string|null","confidence":"high"|"low"}. ' +
        'Sem texto fora do JSON.',
    ]);

    const text = result.response.text().trim();
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean) as PaymentProofResult;
  } catch (err) {
    console.warn('[vision] image analysis failed:', err);
    return { isPaymentProof: false, confidence: 'low' };
  }
}
