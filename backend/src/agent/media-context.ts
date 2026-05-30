/** Extrai transcrição de mensagens formatadas pelo webhook de mídia. */
export function extractVoiceTranscript(message: string): string | null {
  const voiceQuoted = message.match(/^\(voz do cliente\):\s*"([\s\S]+)"\s*$/);
  if (voiceQuoted?.[1]) return voiceQuoted[1].trim();

  const legacy = message.match(/^\[áudio\]\s*([\s\S]+)$/);
  if (legacy?.[1]) return legacy[1].trim();

  return null;
}

function isFailedTranscript(text: string): boolean {
  return (
    text.startsWith('[') ||
    text.includes('não transcrito') ||
    text.includes('GROQ_API_KEY ausente') ||
    text.includes('sem fala detectada')
  );
}

/** Contexto extra no system prompt quando a mensagem atual é áudio ou imagem. */
export function buildMediaMessageContext(message: string): string {
  const voice = extractVoiceTranscript(message);
  if (voice) {
    if (isFailedTranscript(voice)) {
      return (
        `\n\n## Áudio recebido agora` +
        `\nA transcrição falhou. Peça ao cliente para repetir em texto ou reenviar o áudio.`
      );
    }
    return (
      `\n\n## Áudio recebido agora (PRIORIDADE)` +
      `\nTranscrição do que o cliente acabou de falar:\n"${voice}"` +
      `\nResponda PRIMEIRO e diretamente a essa fala.` +
      `\nNão confunda com imagens ou textos anteriores no histórico.`
    );
  }

  if (message.startsWith('[imagem:') || message.startsWith('[imagem enviada]')) {
    return (
      `\n\n## Imagem recebida agora` +
      `\n${message}` +
      `\nResponda ao conteúdo desta imagem na mensagem atual.`
    );
  }

  return '';
}

export function formatVoiceMessage(transcript: string): string {
  return `(voz do cliente): "${transcript.replace(/"/g, "'")}"`;
}
