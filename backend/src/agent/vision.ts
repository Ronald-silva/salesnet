import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';
import type { DecryptedMedia } from '../integrations/whatsapp/media-download';

let genai: GoogleGenerativeAI | null = null;

const VISION_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'] as const;

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

function parseGeminiJson(text: string): GeminiImageJson | null {
  const clean = text.replace(/```json|```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as GeminiImageJson;
  } catch {
    return null;
  }
}

async function describeImagePlain(
  base64: string,
  mimeType: string,
  modelName: string,
): Promise<string> {
  const model = getGeminiClient().getGenerativeModel({ model: modelName });
  const result = await model.generateContent([
    { inlineData: { data: base64, mimeType } },
    'Descreva esta imagem em 1-2 frases em português do Brasil. ' +
      'Cliente de provedor de internet — pode ser comprovante, teste de velocidade, roteador, tela de erro, etc. ' +
      'Responda só com a descrição, sem JSON.',
  ]);
  return result.response.text().trim();
}

/** Analisa imagem com Gemini: descrição em PT + detecção de comprovante de pagamento. */
export async function analyzeImage(media: DecryptedMedia): Promise<ImageAnalysisResult> {
  const empty: ImageAnalysisResult = {
    description: '',
    paymentProof: { isPaymentProof: false, confidence: 'low' },
  };

  if (!env.GEMINI_API_KEY) {
    console.warn('[vision] GEMINI_API_KEY not configured — skipping image analysis');
    return empty;
  }

  const base64 = media.buffer.toString('base64');
  const mimeType = media.mimetype || 'image/jpeg';

  for (const modelName of VISION_MODELS) {
    try {
      const model = getGeminiClient().getGenerativeModel({ model: modelName });

      const result = await model.generateContent([
        { inlineData: { data: base64, mimeType } },
        'Você analisa imagens enviadas por clientes de um provedor de internet (ISP). ' +
          'Descreva o conteúdo em 1-2 frases em português (teste de velocidade, roteador, tela de erro, ' +
          'comprovante, boleto, produto, etc.). ' +
          'Também indique se é comprovante de pagamento/PIX/transferência. ' +
          'Responda APENAS com JSON válido: ' +
          '{"description":"string","isPaymentProof":false,"amount":null,' +
          '"date":null,"beneficiary":null,"confidence":"low"}. ' +
          'Sem markdown, sem texto fora do JSON.',
      ]);

      const text = result.response.text().trim();
      const parsed = parseGeminiJson(text);

      if (parsed?.description?.trim()) {
        const paymentProof: PaymentProofResult = {
          isPaymentProof: parsed.isPaymentProof === true,
          confidence: parsed.confidence === 'high' ? 'high' : 'low',
          ...(parsed.amount != null ? { amount: parsed.amount } : {}),
          ...(parsed.date ? { date: parsed.date } : {}),
          ...(parsed.beneficiary ? { beneficiary: parsed.beneficiary } : {}),
        };
        console.log(
          `[vision] ok (${modelName}, ${media.buffer.length} bytes): ${parsed.description.slice(0, 120)}`,
        );
        return { description: parsed.description.trim(), paymentProof };
      }

      const plain = text.replace(/```/g, '').trim();
      if (plain.length > 10 && !plain.startsWith('{')) {
        console.log(`[vision] ok plain (${modelName}): ${plain.slice(0, 120)}`);
        return { description: plain, paymentProof: { isPaymentProof: false, confidence: 'low' } };
      }

      const fallbackDesc = await describeImagePlain(base64, mimeType, modelName);
      if (fallbackDesc.length > 5) {
        console.log(`[vision] ok fallback (${modelName}): ${fallbackDesc.slice(0, 120)}`);
        return {
          description: fallbackDesc,
          paymentProof: { isPaymentProof: false, confidence: 'low' },
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[vision] ${modelName} failed: ${msg.slice(0, 200)}`);
    }
  }

  console.warn('[vision] all models failed — returning empty description');
  return empty;
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
