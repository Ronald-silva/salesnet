/**
 * Bootstrap — Inicialização dos Providers WhatsApp
 *
 * Configura o ProviderRegistry com o provider ativo conforme WHATSAPP_PROVIDER.
 * Também garante que a instância padrão exista no Supabase (auto-provision).
 * Chamado uma vez na inicialização do servidor.
 */

import { env } from './config/env';
import { providerRegistry } from './integrations/whatsapp/provider-registry';
import { EvolutionGoProvider } from './integrations/whatsapp/providers/evolution-go';
import { TwilioLegacyProvider } from './integrations/whatsapp/providers/twilio-legacy';
import { instanceManager } from './services/instance-manager';
import { logEvolutionWebhookHmacConfig } from './integrations/whatsapp/webhook-hmac-diagnostics';

export function bootstrapProviders(): void {
  if (env.WHATSAPP_PROVIDER === 'evolution-go') {
    const evolution = new EvolutionGoProvider({
      baseUrl: env.EVOLUTION_API_URL!,
      apiKey: env.EVOLUTION_API_KEY!,
      defaultInstanceToken: env.EVOLUTION_INSTANCE_TOKEN,
    });
    providerRegistry.register(evolution, true);
    console.log(`✅ WhatsApp provider: Evolution Go (${env.EVOLUTION_API_URL})`);
    if (env.EVOLUTION_INSTANCE_TOKEN) {
      console.log(`   Instance token: definido via EVOLUTION_INSTANCE_TOKEN`);
    } else {
      console.warn(`   ⚠️  EVOLUTION_INSTANCE_TOKEN não definido — necessário para envio de mensagens`);
    }
  }

  // Registrar Twilio como provider de fallback se vars disponíveis
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_NUMBER) {
    const twilio = new TwilioLegacyProvider({
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      whatsappNumber: env.TWILIO_WHATSAPP_NUMBER,
    });
    const isDefault = env.WHATSAPP_PROVIDER === 'twilio';
    providerRegistry.register(twilio, isDefault);
    console.log(`✅ WhatsApp provider registered: Twilio (${isDefault ? 'default' : 'fallback — legado'})`);
  }

  const registeredProviders = providerRegistry.list();
  if (registeredProviders.length === 0) {
    throw new Error('No WhatsApp provider configured. Check WHATSAPP_PROVIDER env vars.');
  }
}

/**
 * Garante que a instância padrão do Evolution Go existe no Supabase.
 * Se não existir, provisiona no Evolution Go e salva no banco.
 * Chamado fire-and-forget no startup — falhas não bloqueiam o servidor.
 */
export async function ensureDefaultInstance(): Promise<void> {
  if (env.WHATSAPP_PROVIDER !== 'evolution-go') return;

  logEvolutionWebhookHmacConfig();

  const instanceName = env.EVOLUTION_INSTANCE_NAME;
  const tenantId = env.DEFAULT_TENANT_ID;

  const webhookUrl = env.BACKEND_URL
    ? `${env.BACKEND_URL}/webhook/whatsapp/${instanceName}`
    : undefined;

  try {
    let existing = await instanceManager.findByName(instanceName);

    if (!existing && env.EVOLUTION_INSTANCE_TOKEN) {
      // Instance missing from Supabase but token is known — upsert the row directly.
      // Avoids calling Evolution Go createInstance (which would fail: instance already exists).
      existing = await instanceManager.registerFromToken(
        tenantId,
        instanceName,
        env.EVOLUTION_INSTANCE_TOKEN,
        webhookUrl,
      );
      if (existing) {
        console.log(`✅ WhatsApp instance "${instanceName}" registrada no Supabase a partir do EVOLUTION_INSTANCE_TOKEN.`);
      }
    }

    if (existing) {
      console.log(`✅ WhatsApp instance: "${instanceName}" (${existing.status})`);

      if (env.BACKEND_URL && env.EVOLUTION_INSTANCE_TOKEN) {
        // Populate local cache (needed for outgoing messages)
        const provider = providerRegistry.get('evolution-go') as unknown as {
          setInstanceToken(name: string, token: string, url: string): void;
          connectInstance(name: string): Promise<unknown>;
          logRemoteWebhookConfig(name: string): Promise<void>;
        };
        provider.setInstanceToken(instanceName, env.EVOLUTION_INSTANCE_TOKEN, webhookUrl!);

        // Re-register webhook URL with Evolution Go on every startup
        // (Evolution Go may lose webhook config after its own restart)
        try {
          await provider.connectInstance(instanceName);
          console.log(`   ✅ Webhook re-registrado: ${webhookUrl}`);
          await provider.logRemoteWebhookConfig(instanceName);
        } catch (err) {
          console.warn(`   ⚠️  Falha ao re-registrar webhook:`, (err as Error).message);
        }
      }
      return;
    }

    // Last resort: provision a brand-new instance via Evolution Go API
    await instanceManager.provisionInstance(tenantId, {
      instanceName,
      webhookUrl,
      tenantId,
      qrcode: true,
    });

    console.log(`🆕 Instância "${instanceName}" provisionada.`);
    console.log(`   Escaneie o QR via: GET /api/admin/instances/{id}/qrcode`);
    if (webhookUrl) {
      console.log(`   Webhook configurado: ${webhookUrl}`);
    }
  } catch (err) {
    console.warn(`⚠️  Não foi possível provisionar instância "${instanceName}":`, (err as Error).message);
    console.warn('   Crie manualmente via: POST /api/admin/instances');
  }
}
