-- Migration 020 — Isolamento de threads e logs por tenant

ALTER TABLE conversation_threads
  ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default';

ALTER TABLE interaction_logs
  ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default';

ALTER TABLE processed_message_ids
  ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE conversation_threads
SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'default')
WHERE tenant_id IS NULL OR tenant_id = '';

UPDATE interaction_logs
SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'default')
WHERE tenant_id IS NULL OR tenant_id = '';

UPDATE processed_message_ids
SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'default')
WHERE tenant_id IS NULL;

ALTER TABLE conversation_threads DROP CONSTRAINT IF EXISTS conversation_threads_phone_key;

DROP INDEX IF EXISTS conversation_threads_phone_idx;

CREATE UNIQUE INDEX IF NOT EXISTS conversation_threads_tenant_phone_uidx
  ON conversation_threads (tenant_id, phone);

CREATE INDEX IF NOT EXISTS idx_conversation_threads_tenant_updated
  ON conversation_threads (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_interaction_logs_tenant_phone_created
  ON interaction_logs (tenant_id, phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_processed_message_ids_tenant_processed
  ON processed_message_ids (tenant_id, processed_at DESC);
