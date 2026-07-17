jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../../config/supabase';
import { captureConversationQuality } from '../../agent/nps-flow';

const TENANT_ID = 'tenant-x';
const PHONE = '+5585999990001';

// PIX/EMV sintético — não é um código real, só bate o mesmo formato reconhecido
// por PIX_EMV_RE (000201...6304XXXX) para exercitar o filtro de exclusão.
const FAKE_PIX_EMV = `000201${'A'.repeat(30)}6304F00D`;

// Builder encadeável — mesmo padrão usado em bring-forward-flow.test.ts.
function chain(overrides: Record<string, unknown> = {}): any {
  const obj: any = {
    select: jest.fn(() => obj),
    eq: jest.fn(() => obj),
    order: jest.fn(() => obj),
    limit: jest.fn(() => obj),
    insert: jest.fn().mockResolvedValue({ error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  return obj;
}

function mockSupabaseTables(opts: {
  interactionLog: Record<string, unknown> | null;
  threadMessages?: unknown[];
}) {
  const interactionLogsChain = chain({
    maybeSingle: jest.fn().mockResolvedValue({ data: opts.interactionLog, error: null }),
  });
  const threadChain = chain({
    maybeSingle: jest.fn().mockResolvedValue({
      data: opts.threadMessages ? { messages: opts.threadMessages } : null,
      error: null,
    }),
  });
  const insertSpy = jest.fn().mockResolvedValue({ error: null });
  const qualityChain = chain({ insert: insertSpy });

  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'interaction_logs') return interactionLogsChain;
    if (table === 'conversation_threads') return threadChain;
    if (table === 'conversation_quality') return qualityChain;
    throw new Error(`unexpected table in test: ${table}`);
  });

  return { insertSpy };
}

beforeEach(() => jest.clearAllMocks());

describe('captureConversationQuality — defesa contra vazamento de PIX cross-cliente', () => {
  const responseWithRealPix =
    'Aqui está seu Pix, copie o código abaixo:\n' +
    FAKE_PIX_EMV +
    '\nQualquer dúvida, é só chamar!';

  it.each([
    ['nota 5 (good)', 5],
    ['nota 1 (bad, <=2)', 1],
  ])(
    'nunca produz key_phrase com EMV mesmo se response_placeholder vier contaminado com PIX real (%s) — testa o filtro do item 2 isolado, simulando falha do item 1',
    async (_label, score) => {
      const { insertSpy } = mockSupabaseTables({
        interactionLog: {
          session_mode: 'billing',
          tool_calls: [],
          response_placeholder: responseWithRealPix,
        },
        threadMessages: [
          { role: 'user', content: 'oi' },
          { role: 'assistant', content: 'oi!' },
        ],
      });

      await captureConversationQuality(PHONE, TENANT_ID, score, 'session-1');

      expect(insertSpy).toHaveBeenCalledTimes(1);
      const inserted = insertSpy.mock.calls[0][0];
      const keyPhrases: string[] = inserted.key_phrases;

      expect(keyPhrases.some((p) => p.includes('000201'))).toBe(false);
      expect(
        keyPhrases.some((p) => /000201[^\n]{20,600}?6304[0-9A-Fa-f]{4}/.test(p)),
      ).toBe(false);
      // Só a frase com o EMV é descartada — as duas frases legítimas ao redor sobrevivem.
      expect(keyPhrases).toEqual(
        expect.arrayContaining([
          'Aqui está seu Pix, copie o código abaixo:',
          'Qualquer dúvida, é só chamar!',
        ]),
      );
      expect(keyPhrases.length).toBe(2);
    },
  );

  it('caminho normal: response_placeholder com token {{PIX_xxxxxxxx}} não resolvido passa intacto', async () => {
    const responseWithPlaceholder =
      'Aqui está seu Pix, copie o código: {{PIX_a1b2c3d4}}\nQualquer dúvida, chamo aqui!';
    const { insertSpy } = mockSupabaseTables({
      interactionLog: {
        session_mode: 'billing',
        tool_calls: [],
        response_placeholder: responseWithPlaceholder,
      },
    });

    await captureConversationQuality(PHONE, TENANT_ID, 5, 'session-2');

    const inserted = insertSpy.mock.calls[0][0];
    expect(inserted.key_phrases.length).toBeGreaterThan(0);
    expect(inserted.marked_as_example).toBe(true);
    expect(inserted.example_type).toBe('good');
  });

  it('response_placeholder ausente (linha histórica, NULL) nunca cai de volta para o texto resolvido', async () => {
    const { insertSpy } = mockSupabaseTables({
      interactionLog: {
        session_mode: 'billing',
        tool_calls: [],
        response_placeholder: null,
      },
    });

    await captureConversationQuality(PHONE, TENANT_ID, 1, 'session-3');

    const inserted = insertSpy.mock.calls[0][0];
    expect(inserted.key_phrases).toEqual([]);
    expect(inserted.example_type).toBe('bad');
  });
});
