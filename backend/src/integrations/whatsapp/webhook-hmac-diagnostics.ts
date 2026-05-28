/**
 * Startup diagnostics for Evolution Go webhook HMAC alignment.
 * Logs SHA-256 fingerprints (first 8 hex chars) — never the raw secret.
 */
import { createHash } from 'crypto';
import { env } from '../../config/env';

export function secretFingerprint(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex').slice(0, 8);
}

export function logEvolutionWebhookHmacConfig(): void {
  if (env.WHATSAPP_PROVIDER !== 'evolution-go') return;

  const webhookSecret = env.EVOLUTION_WEBHOOK_SECRET;
  const instanceToken = env.EVOLUTION_INSTANCE_TOKEN;
  const skip = env.EVOLUTION_WEBHOOK_SKIP_HMAC === true;

  console.log('[webhook-hmac] ── Evolution Go HMAC config ──');

  if (skip) {
    console.warn('[webhook-hmac] EVOLUTION_WEBHOOK_SKIP_HMAC=true — validation disabled');
  } else if (!webhookSecret && !instanceToken) {
    console.warn('[webhook-hmac] no secrets configured — validation disabled');
  } else {
    console.log(
      '[webhook-hmac] validation enabled (HMAC if x-webhook-signature sent; else apikey or open for Evolution Go)',
    );
  }

  if (webhookSecret) {
    console.log(
      `[webhook-hmac] EVOLUTION_WEBHOOK_SECRET fp=${secretFingerprint(webhookSecret)} len=${webhookSecret.length}`,
    );
  } else {
    console.log('[webhook-hmac] EVOLUTION_WEBHOOK_SECRET: (unset)');
  }

  if (instanceToken) {
    console.log(
      `[webhook-hmac] EVOLUTION_INSTANCE_TOKEN fp=${secretFingerprint(instanceToken)} len=${instanceToken.length}`,
    );
  } else {
    console.warn('[webhook-hmac] EVOLUTION_INSTANCE_TOKEN: (unset)');
  }

  if (env.EVOLUTION_API_KEY) {
    console.log(
      `[webhook-hmac] EVOLUTION_API_KEY fp=${secretFingerprint(env.EVOLUTION_API_KEY)} len=${env.EVOLUTION_API_KEY.length}`,
    );
  }

  if (webhookSecret && instanceToken) {
    const identical = webhookSecret === instanceToken;
    console.log(
      `[webhook-hmac] WEBHOOK_SECRET vs INSTANCE_TOKEN: ${identical ? 'identical' : 'different (both tried on verify)'}`,
    );
  }

  const connectSecret = env.EVOLUTION_WEBHOOK_SECRET ?? env.EVOLUTION_INSTANCE_TOKEN;
  if (connectSecret) {
    console.log(
      `[webhook-hmac] connectInstance webhookSecret fp=${secretFingerprint(connectSecret)}`,
    );
  }

  const expectedUrl = env.BACKEND_URL
    ? `${env.BACKEND_URL}/webhook/whatsapp/${env.EVOLUTION_INSTANCE_NAME}`
    : undefined;
  if (expectedUrl) {
    console.log(`[webhook-hmac] expected webhook URL: ${expectedUrl}`);
  } else {
    console.warn('[webhook-hmac] BACKEND_URL unset — connect may register empty webhookUrl');
  }

  console.log(
    '[webhook-hmac] Compare fp with Evolution Webhook Secret (panel): run locally:\n' +
      '  node -e "const c=require(\'crypto\');const s=process.argv[1];' +
      'console.log(c.createHash(\'sha256\').update(s).digest(\'hex\').slice(0,8))" YOUR_SECRET',
  );
}
