import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { env } from '../config/env';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export interface PaymentProofResult {
  isPaymentProof: boolean;
  amount?: number;
  date?: string;
  beneficiary?: string;
  confidence: 'high' | 'low';
}

export async function analyzeImage(imageUrl: string): Promise<PaymentProofResult> {
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10_000 });
    const base64 = Buffer.from(response.data as ArrayBuffer).toString('base64');
    const contentType = (response.headers['content-type'] as string | undefined) ?? 'image/jpeg';
    const mediaType = contentType.split(';')[0]?.trim() as
      | 'image/jpeg'
      | 'image/png'
      | 'image/gif'
      | 'image/webp';

    const result = await anthropic.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: 'Esta imagem é um comprovante de pagamento ou transferência bancária? Se sim, extraia: valor em reais, data, nome do beneficiário. Responda APENAS com JSON no formato: {"isPaymentProof":bool,"amount":number|null,"date":"string|null","beneficiary":"string|null","confidence":"high"|"low"}. Sem texto fora do JSON.',
            },
          ],
        },
      ],
    });

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    return JSON.parse(text) as PaymentProofResult;
  } catch (err) {
    console.warn('[vision] image analysis failed:', err);
    return { isPaymentProof: false, confidence: 'low' };
  }
}
