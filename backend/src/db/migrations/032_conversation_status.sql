-- Migration 032: adiciona status de ciclo de vida, encerramento e favoritos em conversation_threads
-- Executar no Supabase SQL Editor

ALTER TABLE conversation_threads
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'waiting', 'closed'));

ALTER TABLE conversation_threads
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE conversation_threads
  ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_conv_threads_status
  ON conversation_threads(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_conv_threads_closed_at
  ON conversation_threads(tenant_id, closed_at)
  WHERE closed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conv_threads_starred
  ON conversation_threads(tenant_id, starred)
  WHERE starred = true;

-- RLS: a politica service_role_only existente (migration 027) ja cobre conversation_threads.
-- Se os indices acima gerarem erro de permissao, executar:
-- GRANT ALL ON TABLE conversation_threads TO service_role;
