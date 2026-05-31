export function sanitizeOutgoingMessage(text: string): string {
  return text
    .replace(/[^\u0000-\u024F\u1E00-\u1EFF\s\p{P}\p{N}\p{Emoji}]/gu, '')
    .replace(/\s{3,}/g, '\n\n')
    .trim();
}
