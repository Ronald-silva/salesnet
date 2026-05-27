import express from 'express';
import cors from 'cors';
import type { IncomingMessage } from 'http';
import { env } from './config/env';
import { bootstrapProviders, ensureDefaultInstance } from './bootstrap';
import { webhookRouter, twilioLegacyRouter } from './routes/webhook-router';
import { eventBus } from './services/event-bus';
import { processMessage } from './agent';
import { startAutomations, paymentWebhookRouter, campaignExpansionRouter } from './automations';
import { authRouter } from './routes/auth';
import { clientRouter } from './routes/client';
import { adminRouter } from './routes/admin';
import { adminInstancesRouter } from './routes/admin-instances';
import { reportsRouter } from './routes/reports';
import { adminAuthMiddleware } from './middleware/adminAuth';
import { webhookRateLimiter, apiRateLimiter } from './middleware/rateLimiter';
import cron from 'node-cron';
import { instanceManager } from './services/instance-manager';

// ── Bootstrap providers ────────────────────────────────────────────────────
bootstrapProviders();
ensureDefaultInstance().catch((err: unknown) => {
  console.error('[bootstrap] ensureDefaultInstance error:', err);
});

// ── Express app ───────────────────────────────────────────────────────────
const app = express();

app.set('trust proxy', 1);
app.use(cors({
  origin: env.NODE_ENV === 'production'
    ? (env.CORS_ORIGIN ?? false)
    : (env.CORS_ORIGIN ?? '*'),
  credentials: true,
}));
app.use(express.json({
  limit: '10mb',
  verify: (req: IncomingMessage, _res, buf: Buffer) => {
    (req as IncomingMessage & { rawBody?: Buffer }).rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Health ─────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    service:   'salesnet-backend',
    provider:  env.WHATSAPP_PROVIDER,
    timestamp: new Date().toISOString(),
    env:       env.NODE_ENV,
  });
});

// ── Webhooks ───────────────────────────────────────────────────────────────
// Evolution Go: POST /webhook/whatsapp/:instanceName
app.use('/webhook/whatsapp', webhookRateLimiter, webhookRouter);
// Twilio legacy compat: POST /webhook/twilio
app.use('/webhook/twilio', twilioLegacyRouter);
// SGP
app.use('/webhook/sgp', paymentWebhookRouter);

// ── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/campaigns', campaignExpansionRouter);
app.use('/api/auth', apiRateLimiter, authRouter);
app.use('/api/client', apiRateLimiter, clientRouter);
app.use('/api/admin/campaigns', adminAuthMiddleware, campaignExpansionRouter);
app.use('/api/admin/instances', adminInstancesRouter);
app.use('/api/admin/reports', apiRateLimiter, reportsRouter);
app.use('/api/admin', apiRateLimiter, adminRouter);

// ── Event Bus → Agent ──────────────────────────────────────────────────────
eventBus.onIncomingMessage(({ phone, body }) => {
  if (!phone || !body) return;
  processMessage(phone, body).catch((err: unknown) => {
    console.error(`[agent] processMessage error for ${phone}:`, err);
  });
});

// ── Automations ────────────────────────────────────────────────────────────
if (env.NODE_ENV !== 'test') {
  startAutomations();

  // Health check de instâncias a cada 5 minutos
  cron.schedule('*/5 * * * *', () => {
    instanceManager.healthCheckAll().catch((err: unknown) => {
      console.error('[instance-manager] health check error:', err);
    });
  });
}

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(env.PORT, () => {
  console.log(`🚀 SalesNet backend running on port ${env.PORT} [${env.NODE_ENV}]`);
  console.log(`   Health:    http://localhost:${env.PORT}/health`);
  console.log(`   Webhook:   http://localhost:${env.PORT}/webhook/whatsapp/${env.EVOLUTION_INSTANCE_NAME}`);
  console.log(`   Provider:  ${env.WHATSAPP_PROVIDER} | instance: ${env.EVOLUTION_INSTANCE_NAME}`);
});

export default app;
