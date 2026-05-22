-- ═══════════════════════════════════════════════════════════════════════════════
-- SalesNet — Schema de Migração para Evolution Go
-- Rodar no Supabase SQL Editor ou via psql
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Tenants (empresas/provedores) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id          TEXT PRIMARY KEY DEFAULT 'default',
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  settings    JSONB DEFAULT '{}',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Tenant padrão (modo single-tenant)
INSERT INTO tenants (id, name, slug)
VALUES ('salesnet-default', 'SalesNet Telecom', 'salesnet')
ON CONFLICT (id) DO NOTHING;

-- ── Instâncias WhatsApp ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  instance_name       TEXT UNIQUE NOT NULL,
  provider            TEXT NOT NULL DEFAULT 'evolution-go',
  phone_number        TEXT,
  status              TEXT DEFAULT 'disconnected'
                        CHECK (status IN ('connected', 'disconnected', 'connecting')),
  webhook_url         TEXT,
  settings            JSONB DEFAULT '{}',
  last_connected_at   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instances_tenant ON whatsapp_instances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_instances_status ON whatsapp_instances(status);

-- Instância padrão Evolution Go
-- Número de produção: +55 85 8475-1101 (escanear QR Code para vincular)
-- Para testes: +55 85 99199-3833
INSERT INTO whatsapp_instances (tenant_id, instance_name, provider, status)
VALUES ('salesnet-default', 'salesnet', 'evolution-go', 'disconnected')
ON CONFLICT (instance_name) DO NOTHING;

-- ── Log de Envios (rate limiting / observabilidade) ──────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_send_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name   TEXT NOT NULL,
  to_phone        TEXT,
  template_name   TEXT,
  status          TEXT DEFAULT 'sent',
  sent_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_send_log_instance_date
  ON whatsapp_send_log(instance_name, sent_at DESC);

-- Limpeza automática (manter 90 dias)
-- (Configurar no Supabase pg_cron ou via cron job externo)

-- ── Sessões WhatsApp (backup de sessões Evolution) ───────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id   UUID REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  session_data  JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ── Atualizar tabelas existentes (se necessário) ─────────────────────────────

-- Adicionar tenant_id nas conversation_threads (para multi-tenant futuro)
ALTER TABLE conversation_threads
  ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default';

-- Índice para busca por tenant
CREATE INDEX IF NOT EXISTS idx_threads_tenant
  ON conversation_threads(tenant_id);

-- Adicionar instance_name nos logs de interação
ALTER TABLE interaction_logs
  ADD COLUMN IF NOT EXISTS instance_name TEXT;

-- ── Trigger: atualizar updated_at automaticamente ────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_whatsapp_instances_updated_at'
  ) THEN
    CREATE TRIGGER trg_whatsapp_instances_updated_at
      BEFORE UPDATE ON whatsapp_instances
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
