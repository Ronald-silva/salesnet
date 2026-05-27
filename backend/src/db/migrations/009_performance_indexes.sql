-- Migration 009 — Performance indexes (Supabase SQL Editor)
--
-- O SQL Editor do Supabase roda tudo dentro de uma transação.
-- CREATE INDEX CONCURRENTLY NÃO funciona aí (erro 25001).
-- Use ESTE arquivo inteiro no editor (sem CONCURRENTLY).
--
-- Para índices sem bloquear escrita em tabelas grandes, use psql direto:
--   backend/src/db/migrations/009_performance_indexes_concurrent.sql
--   (uma linha CREATE INDEX por execução)

-- Pré-requisitos (migrations 003/012 — idempotente se já aplicadas)
ALTER TABLE interaction_logs ADD COLUMN IF NOT EXISTS session_mode TEXT;
ALTER TABLE interaction_logs ADD COLUMN IF NOT EXISTS processing_ms INTEGER;

CREATE INDEX IF NOT EXISTS
  idx_conversation_threads_phone
  ON conversation_threads (phone);

CREATE INDEX IF NOT EXISTS
  idx_interaction_logs_phone_created
  ON interaction_logs (phone, created_at DESC);

CREATE INDEX IF NOT EXISTS
  idx_interaction_logs_session_mode
  ON interaction_logs (session_mode, created_at DESC);

CREATE INDEX IF NOT EXISTS
  idx_leads_created
  ON leads (created_at DESC);

CREATE INDEX IF NOT EXISTS
  idx_scheduled_visits_date_status
  ON scheduled_visits (visit_date, status) WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS
  idx_billing_notifications_phone_sent_at
  ON billing_notifications (phone, sent_at DESC);

CREATE INDEX IF NOT EXISTS
  idx_sofia_tickets_contrato_status
  ON sofia_tickets (contrato, status);

CREATE INDEX IF NOT EXISTS
  idx_scheduled_messages_send_after
  ON scheduled_messages (send_after, sent) WHERE sent = false;

ANALYZE;
