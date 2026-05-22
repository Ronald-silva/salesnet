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

export function bootstrapProviders(): void {
  if (env.WHATSAPP_PROVIDER === 'evolution-go') {
    const evolution = new EvolutionGoProvider({
      baseUrl: env.EVOLUTION_API_URL!,
      apiKey: env.EVOLUTION_API_KEY!,
    });
    providerRegistry.register(evolution, true);
    console.log(`✅ WhatsApp provider: Evolution Go (${env.EVOLUTION_API_URL})`);
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

  const instanceName = env.EVOLUTION_INSTANCE_NAME;
  const tenantId = env.DEFAULT_TENANT_ID;

  try {
    const existing = await instanceManager.findByName(instanceName);
    if (existing) {
      console.log(`✅ WhatsApp instance: "${instanceName}" (${existing.status})`);
      return;
    }

    // Instância não existe — provisionar no Evolution Go e registrar no Supabase
    const webhookUrl = env.BACKEND_URL
      ? `${env.BACKEND_URL}/webhook/whatsapp/${instanceName}`
      : undefined;

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
