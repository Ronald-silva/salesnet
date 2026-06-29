/**
 * PDF analysis via Gemini — detects boletos and extracts fields.
 * Uses the same inline_data pattern as vision.ts (no extra dependencies).
 * Gemini 2.5 Flash handles both text-based and image-based PDFs natively.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';
import type { DecryptedMedia } from '../integrations/whatsapp/media-download';

let genai: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
  if (!genai) genai = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  return genai;
}

const PDF_MODELS = ['gemini-2.5-flash', 'gemini-1.5-flash'] as const;

export interface PdfAnalysisResult {
  isBoleto: boolean;
  valor?: string;
  vencimento?: string;
  linhaDigitavel?: string;
  beneficiario?: string;
  descricao: string;
}

interface GeminiPdfJson {
  isBoleto?: boolean;
  valor?: string | null;
  vencimento?: string | null;
  linhaDigitavel?: string | null;
  beneficiario?: string | null;
  descricao?: string | null;
}

function parseJson(text: string): GeminiPdfJson | null {
  const clean = text.replace(/```json|```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as GeminiPdfJson;
  } catch {
    return null;
  }
}

export async function analyzePdf(media: DecryptedMedia): Promise<PdfAnalysisResult> {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

  const base64 = media.buffer.toString('base64');

  for (const modelName of PDF_MODELS) {
    try {
      const model = getGeminiClient().getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        { inlineData: { data: base64, mimeType: 'application/pdf' } },
        'Analise este documento PDF enviado por um cliente de provedor de internet. ' +
        'Se for um boleto bancário ou fatura, extraia os campos. ' +
        'Responda APENAS com JSON válido (sem markdown): ' +
        '{"isBoleto":true,"valor":"1.234,56","vencimento":"30/06/2026",' +
        '"linhaDigitavel":"12345.67890 12345.678901 12345.678901 1 12340000012345",' +
        '"beneficiario":"Empresa Ltda","descricao":"Fatura de internet referente a julho/2026"}. ' +
        'Todos os campos exceto isBoleto e descricao são opcionais — inclua só o que aparecer claramente. ' +
        'Se NÃO for boleto: {"isBoleto":false,"descricao":"descrição breve em PT do que é o documento"}.',
      ]);

      const text = result.response.text().trim();
      const parsed = parseJson(text);

      if (parsed) {
        const info: PdfAnalysisResult = {
          isBoleto: parsed.isBoleto === true,
          descricao: parsed.descricao?.trim() ?? '',
          ...(parsed.valor ? { valor: String(parsed.valor) } : {}),
          ...(parsed.vencimento ? { vencimento: String(parsed.vencimento) } : {}),
          ...(parsed.linhaDigitavel ? { linhaDigitavel: String(parsed.linhaDigitavel) } : {}),
          ...(parsed.beneficiario ? { beneficiario: String(parsed.beneficiario) } : {}),
        };
        console.log(
          `[pdf] ok (${modelName}, ${media.buffer.length} bytes): isBoleto=${info.isBoleto} descricao=${info.descricao.slice(0, 80)}`,
        );
        return info;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[pdf] ${modelName} failed: ${msg.slice(0, 200)}`);
    }
  }

  throw new Error('All PDF models failed');
}

export function formatPdfBody(info: PdfAnalysisResult, fileName?: string): string {
  const label = fileName ? `: ${fileName}` : '';

  if (!info.isBoleto) {
    const desc = info.descricao || 'conteúdo não identificado';
    return `[documento PDF${label}: ${desc}]`;
  }

  const lines: string[] = [`[boleto PDF${label}]`];
  if (info.descricao) lines.push(info.descricao);
  if (info.valor) lines.push(`Valor: R$ ${info.valor}`);
  if (info.vencimento) lines.push(`Vencimento: ${info.vencimento}`);
  if (info.linhaDigitavel) lines.push(`Linha digitável: ${info.linhaDigitavel}`);
  if (info.beneficiario) lines.push(`Beneficiário: ${info.beneficiario}`);
  return lines.join('\n');
}
