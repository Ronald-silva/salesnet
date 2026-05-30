/**
 * Download e descriptografia de mídia recebida do WhatsApp (whatsmeow / Evolution Go).
 *
 * Mídia recebida não vem em claro: o webhook entrega os campos do protocolo
 * (URL do arquivo `.enc` na CDN do WhatsApp + `mediaKey`). Para ler o conteúdo é
 * preciso baixar o `.enc` e descriptografar localmente (AES-256-CBC com chaves
 * derivadas via HKDF-SHA256), exatamente como o Baileys/whatsmeow fazem.
 *
 * Isso funciona pra QUALQUER tipo de mídia (áudio, imagem, vídeo, documento) e
 * não depende de endpoints do servidor — o Evolution Go só expõe download de
 * imagem (`/message/downloadimage`), usado como fallback no provider.
 */

import crypto from 'crypto';
import axios from 'axios';

export type WAMediaType = 'image' | 'audio' | 'video' | 'document';

export interface DecryptedMedia {
  buffer: Buffer;
  mimetype: string;
}

// Info string do HKDF por tipo de mídia (constante do protocolo WhatsApp).
const HKDF_INFO: Record<WAMediaType, string> = {
  image: 'WhatsApp Image Keys',
  video: 'WhatsApp Video Keys',
  audio: 'WhatsApp Audio Keys',
  document: 'WhatsApp Document Keys',
};

const DEFAULT_MIME: Record<WAMediaType, string> = {
  image: 'image/jpeg',
  video: 'video/mp4',
  audio: 'audio/ogg',
  document: 'application/octet-stream',
};

/** Lê um campo tolerando variações de caixa (whatsmeow usa `URL`, `mediaKey`, etc.). */
export function pickField(
  obj: Record<string, unknown> | undefined,
  names: string[],
): unknown {
  if (!obj) return undefined;
  for (const n of names) {
    if (obj[n] != null) return obj[n];
  }
  return undefined;
}

/** Identifica o tipo de mídia pelo conteúdo da Message proto (mais confiável que Info.Type). */
export function detectMediaType(
  msg: Record<string, unknown>,
): { type: WAMediaType; media: Record<string, unknown> } | null {
  const map: Array<[string, WAMediaType]> = [
    ['audioMessage', 'audio'],
    ['imageMessage', 'image'],
    ['videoMessage', 'video'],
    ['documentMessage', 'document'],
  ];
  for (const [key, type] of map) {
    const media = msg[key] as Record<string, unknown> | undefined;
    if (media && typeof media === 'object') return { type, media };
  }
  return null;
}

/**
 * Baixa o `.enc` da CDN e descriptografa. Retorna null se faltar URL ou a
 * descriptografia falhar (o caller decide o fallback).
 */
export async function fetchAndDecryptWAMedia(
  media: Record<string, unknown>,
  type: WAMediaType,
): Promise<DecryptedMedia | null> {
  const url = pickField(media, ['URL', 'url']);
  const mediaKeyB64 = pickField(media, ['mediaKey', 'MediaKey']);
  const mimetype = (pickField(media, ['mimetype', 'Mimetype']) as string) ?? DEFAULT_MIME[type];

  if (typeof url !== 'string' || url.length === 0) return null;

  const resp = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 15_000,
  });
  let buffer = Buffer.from(resp.data);

  if (typeof mediaKeyB64 === 'string' && mediaKeyB64.length > 0) {
    const mediaKey = Buffer.from(mediaKeyB64, 'base64');
    buffer = decryptWAMedia(buffer, mediaKey, type);
  }

  return { buffer, mimetype };
}

/**
 * AES-256-CBC com chaves derivadas do `mediaKey`. O arquivo `.enc` é
 * `ciphertext || mac(10 bytes)`; descartamos o MAC e deciframos o resto
 * (padding PKCS#7 tratado pelo Node automaticamente).
 */
function decryptWAMedia(enc: Buffer, mediaKey: Buffer, type: WAMediaType): Buffer {
  const expanded = hkdfSha256(mediaKey, 112, HKDF_INFO[type]);
  const iv = expanded.subarray(0, 16);
  const cipherKey = expanded.subarray(16, 48);

  const ciphertext = enc.subarray(0, Math.max(0, enc.length - 10));
  const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** HKDF-SHA256 (RFC 5869) com salt zero — implementação explícita pra evitar
 *  diferenças de comportamento entre versões do Node. */
function hkdfSha256(ikm: Buffer, length: number, info: string): Buffer {
  const salt = Buffer.alloc(32, 0);
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  const infoBuf = Buffer.from(info, 'utf8');

  let out = Buffer.alloc(0);
  let block = Buffer.alloc(0);
  for (let i = 1; out.length < length; i++) {
    block = crypto
      .createHmac('sha256', prk)
      .update(Buffer.concat([block, infoBuf, Buffer.from([i])]))
      .digest();
    out = Buffer.concat([out, block]);
  }
  return out.subarray(0, length);
}

/**
 * Extrai base64 de uma resposta arbitrária do Evolution Go (`gin.H`).
 * Procura chaves comuns e remove prefixo data-URL se houver.
 */
export function extractBase64FromResponse(data: unknown): string | null {
  const KEYS = ['base64', 'Base64', 'b64', 'data', 'Data', 'media', 'Media', 'image', 'Image', 'file', 'File'];
  const visit = (node: unknown, depth: number): string | null => {
    if (depth > 3 || node == null) return null;
    if (typeof node === 'string') {
      const clean = node.replace(/^data:[^;]+;base64,/, '');
      return /^[A-Za-z0-9+/=\r\n]+$/.test(clean) && clean.length > 64 ? clean : null;
    }
    if (typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      for (const k of KEYS) {
        if (obj[k] != null) {
          const found = visit(obj[k], depth + 1);
          if (found) return found;
        }
      }
      for (const v of Object.values(obj)) {
        const found = visit(v, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(data, 0);
}
