import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';
import type { DecryptedMedia } from '../integrations/whatsapp/media-download';

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

export interface ImageAnalysisResult {
  description: string;
  paymentProof: PaymentProofResult;
}

interface GeminiImageJson {
  description?: string;
  isPaymentProof?: boolean;
  amount?: number | null;
  date?: string | null;
  beneficiary?: string | null;
  confidence?: 'high' | 'low';
}

/** Analisa imagem com Gemini: descrição em PT + detecção de comprovante de pagamento. */
export async function analyzeImage(media: DecryptedMedia): Promise<ImageAnalysisResult> {
  if (!env.GEMINI_API_KEY) {
    console.warn('[vision] GEMINI_API_KEY not configured — skipping image analysis');
    return {
      description: '',
      paymentProof: { isPaymentProof: false, confidence: 'low' },
    };
  }

  try {
    const base64 = media.buffer.toString('base64');
    const mimeType = media.mimetype || 'image/jpeg';

    const model = getGeminiClient().getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    const result = await model.generateContent([
      {
        inlineData: { data: base64, mimeType },
      },
      'Você analisa imagens enviadas por clientes de um provedor de internet (ISP). ' +
        'Descreva o conteúdo em 1-2 frases em português (teste de velocidade, roteador, tela de erro, ' +
        'comprovante, boleto, foto de produto aleatório, etc.). ' +
        'Também indique se é comprovante de pagamento/PIX/transferência. ' +
        'Responda APENAS com JSON: ' +
        '{"description":"string","isPaymentProof":bool,"amount":number|null,' +
        '"date":"string|null","beneficiary":"string|null","confidence":"high"|"low"}. ' +
        'Sem texto fora do JSON.',
    ]);

    const text = result.response.text().trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean) as GeminiImageJson;

    const paymentProof: PaymentProofResult = {
      isPaymentProof: parsed.isPaymentProof === true,
      confidence: parsed.confidence === 'high' ? 'high' : 'low',
      ...(parsed.amount != null ? { amount: parsed.amount } : {}),
      ...(parsed.date ? { date: parsed.date } : {}),
      ...(parsed.beneficiary ? { beneficiary: parsed.beneficiary } : {}),
    };

    return {
      description: String(parsed.description ?? '').trim(),
      paymentProof,
    };
  } catch (err) {
    console.warn('[vision] image analysis failed:', err);
    return {
      description: '',
      paymentProof: { isPaymentProof: false, confidence: 'low' },
    };
  }
}

/** Formata análise de imagem como texto injetado no agente. */
export function formatImageBody(
  analysis: ImageAnalysisResult,
  caption?: string,
): string {
  const parts: string[] = [];

  if (analysis.paymentProof.isPaymentProof && analysis.paymentProof.confidence === 'high') {
    parts.push(
      '[imagem: comprovante de pagamento' +
        (analysis.paymentProof.amount != null ? ` de R$${analysis.paymentProof.amount}` : '') +
        (analysis.paymentProof.date ? ` em ${analysis.paymentProof.date}` : '') +
        (analysis.paymentProof.beneficiary ? ` para ${analysis.paymentProof.beneficiary}` : '') +
        ']',
    );
  } else if (analysis.description) {
    parts.push(`[imagem: ${analysis.description}]`);
  } else {
    parts.push('[imagem enviada]');
  }

  if (caption?.trim()) {
    parts.push(`(legenda: ${caption.trim()})`);
  }

  return parts.join(' ');
}
