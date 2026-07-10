export function sanitizeOutgoingMessage(text: string): string {
  return text
    .replace(/[^\p{L}\p{M}\p{P}\p{S}\p{N}\p{Emoji}\s]/gu, '')
    .replace(/\s{3,}/g, '\n\n')
    .trim();
}
