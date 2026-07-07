import { env } from '../config/env';
import { normalizePhone } from '../lib/phone';

/**
 * Trava obrigatória para qualquer script/diagnóstico que envie mensagem real ou
 * chame processMessage diretamente contra um payload sintético. Existe porque um
 * teste ao vivo já vazou para o WhatsApp pessoal real do Ronald (ver CLAUDE.md,
 * "Política de testes ao vivo contra produção") — a checagem de messageId sozinha
 * não evita isso, só ajuda a auditar depois. Lança se o telefone não bater com
 * TEST_SANDBOX_PHONE; nunca chame com número de cliente ou de equipe "só porque
 * está à mão".
 */
export function assertSandboxNumber(phone: string): void {
  if (!env.TEST_SANDBOX_PHONE) {
    throw new Error(
      'assertSandboxNumber: TEST_SANDBOX_PHONE não configurado — defina o número sandbox dedicado antes de rodar qualquer teste ao vivo.',
    );
  }
  if (normalizePhone(phone) !== normalizePhone(env.TEST_SANDBOX_PHONE)) {
    throw new Error(
      `assertSandboxNumber: "${phone}" não é o número sandbox configurado (TEST_SANDBOX_PHONE). ` +
        'Nunca use número pessoal ou de cliente real em teste ao vivo.',
    );
  }
}
