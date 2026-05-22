import express from 'express';
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
import { adminAuthMiddleware } from './middleware/adminAuth';
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use('/webhook/whatsapp', webhookRouter);
// Twilio legacy compat: POST /webhook/twilio
app.use('/webhook/twilio', twilioLegacyRouter);
// SGP
app.use('/webhook/sgp', paymentWebhookRouter);

// ── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/campaigns', campaignExpansionRouter);
app.use('/api/auth', authRouter);
app.use('/api/client', clientRouter);
app.use('/api/admin/campaigns', adminAuthMiddleware, campaignExpansionRouter);
app.use('/api/admin/instances', adminInstancesRouter);
app.use('/api/admin', adminRouter);

// ── Event Bus → Agent ──────────────────────────────────────────────────────
eventBus.onIncomingMessage(({ phone, body }) => {
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
