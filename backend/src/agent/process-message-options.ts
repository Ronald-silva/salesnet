export interface ProcessMessageOptions {
  messageId?: string;
  tenantId?: string;
}

export function parseProcessMessageOptions(
  third?: string | ProcessMessageOptions,
): { messageId?: string; tenantId?: string } {
  if (third === undefined) return {};
  if (typeof third === 'string') return { messageId: third };
  return third;
}
