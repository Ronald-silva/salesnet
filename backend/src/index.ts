import express from 'express';
import { env } from './config/env';
import { twilioWebhookRouter } from './integrations/twilio';
import { messageBus } from './services/message-bus';
import { processMessage } from './agent';
import { startAutomations, paymentWebhookRouter, campaignExpansionRouter } from './automations';

const app = express();

app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    service:   'salesnet-backend',
    timestamp: new Date().toISOString(),
    env:       env.NODE_ENV,
  });
});

app.use('/webhook/twilio', twilioWebhookRouter);
app.use('/webhook/sgp', paymentWebhookRouter);
app.use('/api/campaigns', campaignExpansionRouter);

messageBus.onIncomingMessage(({ phone, body }) => {
  processMessage(phone, body).catch((err: unknown) => {
    console.error(`[agent] processMessage error for ${phone}:`, err);
  });
});

if (env.NODE_ENV !== 'test') {
  startAutomations();
}

app.listen(env.PORT, () => {
  console.log(`🚀 SalesNet backend running on port ${env.PORT} [${env.NODE_ENV}]`);
  console.log(`   Health check: http://localhost:${env.PORT}/health`);
  console.log(`   Twilio webhook: http://localhost:${env.PORT}/webhook/twilio`);
  console.log(`   AI agent: listening on message bus`);
});

export default app;
