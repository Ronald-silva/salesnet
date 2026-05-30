import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // ── LLM ──────────────────────────────────────────────────────────────────
  /** single = usa LLM_PROVIDER para todas mensagens. tiered = roteamento por complexidade. */
  LLM_ROUTING_MODE: z.enum(['single', 'tiered']).default('single'),
  LLM_PROVIDER: z.enum(['anthropic', 'deepseek']).default('anthropic'),
  LLM_FALLBACK_PROVIDER: z.enum(['anthropic', 'deepseek']).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().url().default('https://api.deepseek.com'),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-5'),
  DEEPSEEK_MODEL: z.string().default('deepseek-chat'),
  LLM_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
  LLM_SIMPLE_MAX_TOKENS: z.coerce.number().int().positive().default(512),
  LLM_SIMPLE_MAX_TOOL_ROUNDS: z.coerce.number().int().min(1).max(10).default(3),
  LLM_DAILY_BUDGET_USD: z.coerce.number().positive().default(10),

  // ── Observability ─────────────────────────────────────────────────────────
  SENTRY_DSN: z.string().url().optional(),

  // ── WhatsApp Provider ─────────────────────────────────────────────────────
  /** Provider principal de WhatsApp */
  WHATSAPP_PROVIDER: z.enum(['evolution-go', 'twilio']).default('evolution-go'),

  // Evolution Go
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_INSTANCE_NAME: z.string().default('salesnet'),
  /** Token por-instância (Evolution Go) — gerado na criação e armazenado aqui para single-tenant */
  EVOLUTION_INSTANCE_TOKEN: z.string().optional(),
  /** Segredo HMAC-SHA256 para validar assinaturas de webhook do Evolution Go */
  EVOLUTION_WEBHOOK_SECRET: z.string().optional(),
  /**
   * Só para diagnóstico temporário: aceita webhook sem validar HMAC (NÃO use em produção estável).
   * Use enquanto alinha o Webhook Secret no painel Evolution com EVOLUTION_WEBHOOK_SECRET.
   */
  EVOLUTION_WEBHOOK_SKIP_HMAC: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => v === 'true' || v === '1'),

  // Twilio (legacy — manter para compatibilidade durante transição)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_NUMBER: z.string().optional(),

  // ── Tenant ────────────────────────────────────────────────────────────────
  TENANT_MODE: z.enum(['single', 'multi']).default('single'),
  DEFAULT_TENANT_ID: z.string().default('default'),
  /** URL pública deste backend — usada para montar URLs de webhook das instâncias */
  BACKEND_URL: z.string().url().optional(),
  /** Número WhatsApp (dígitos, ex.: 5585996032957) que recebe alertas operacionais da Sofia */
  ADMIN_ALERT_PHONE: z.string().optional(),

  // ── ERP ───────────────────────────────────────────────────────────────────
  SGP_BASE_URL: z.string().url('SGP_BASE_URL must be a valid URL'),
  SGP_API_TOKEN: z.string().min(1, 'SGP_API_TOKEN is required'),
  SGP_APP_NAME: z.string().min(1, 'SGP_APP_NAME is required'),
  /** Segredo HMAC-SHA256 para validar webhooks de confirmação de pagamento do SGP */
  SGP_WEBHOOK_SECRET: z.string().optional(),

  // ── Database ──────────────────────────────────────────────────────────────
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),

  // ── Server ────────────────────────────────────────────────────────────────
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().url().optional(),
}).superRefine((data, ctx) => {
  // LLM
  if (data.LLM_PROVIDER === 'anthropic' && !data.ANTHROPIC_API_KEY) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ANTHROPIC_API_KEY'], message: 'ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic' });
  }
  if (data.LLM_PROVIDER === 'deepseek' && !data.DEEPSEEK_API_KEY) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['DEEPSEEK_API_KEY'], message: 'DEEPSEEK_API_KEY is required when LLM_PROVIDER=deepseek' });
  }

  // WhatsApp provider
  if (data.WHATSAPP_PROVIDER === 'evolution-go') {
    if (!data.EVOLUTION_API_URL) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['EVOLUTION_API_URL'], message: 'EVOLUTION_API_URL is required when WHATSAPP_PROVIDER=evolution-go' });
    }
    if (!data.EVOLUTION_API_KEY) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['EVOLUTION_API_KEY'], message: 'EVOLUTION_API_KEY is required when WHATSAPP_PROVIDER=evolution-go' });
    }
    // EVOLUTION_WEBHOOK_SECRET is optional — when absent, all webhooks are accepted
    // Set it to enable HMAC validation once Evolution Go is configured to sign requests
  }
  // Twilio é legado — variáveis opcionais, validação apenas em runtime

  if (data.NODE_ENV === 'production' && !data.CORS_ORIGIN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CORS_ORIGIN'],
      message: 'CORS_ORIGIN is required in production (set to your frontend URL, e.g. https://salesnet-green.vercel.app)',
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  parsed.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;

if (env.NODE_ENV === 'production' && !env.EVOLUTION_WEBHOOK_SECRET) {
  console.warn(
    '[env] EVOLUTION_WEBHOOK_SECRET is not set — HMAC checked only when Evolution sends x-webhook-signature',
  );
}

if (env.NODE_ENV === 'production' && !env.SGP_WEBHOOK_SECRET) {
  console.warn(
    '[env] SGP_WEBHOOK_SECRET is not set in production — SGP payment webhook HMAC validation is disabled',
  );
}
