import express from 'express';
import { env } from './config/env';
import { twilioWebhookRouter } from './integrations/twilio';

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

app.listen(env.PORT, () => {
  console.log(`🚀 SalesNet backend running on port ${env.PORT} [${env.NODE_ENV}]`);
  console.log(`   Health check: http://localhost:${env.PORT}/health`);
  console.log(`   Twilio webhook: http://localhost:${env.PORT}/webhook/twilio`);
});

export default app;
