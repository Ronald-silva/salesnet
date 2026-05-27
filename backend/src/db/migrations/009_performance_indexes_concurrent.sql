-- Migration 009b — Performance indexes CONCURRENTLY (psql / cliente fora de transação)
--
-- NÃO rode este arquivo no Supabase SQL Editor (mesmo erro 25001).
-- Execute UMA statement por vez, por exemplo:
--   psql "$DATABASE_URL" -c "CREATE INDEX CONCURRENTLY IF NOT EXISTS ..."

ALTER TABLE interaction_logs ADD COLUMN IF NOT EXISTS session_mode TEXT;
ALTER TABLE interaction_logs ADD COLUMN IF NOT EXISTS processing_ms INTEGER;

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_conversation_threads_phone
  ON conversation_threads (phone);

-- ↓ copie e execute cada bloco separadamente no psql

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_interaction_logs_phone_created
  ON interaction_logs (phone, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_interaction_logs_session_mode
  ON interaction_logs (session_mode, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_leads_created
  ON leads (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_scheduled_visits_date_status
  ON scheduled_visits (visit_date, status) WHERE status = 'scheduled';

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_billing_notifications_phone_sent_at
  ON billing_notifications (phone, sent_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_sofia_tickets_contrato_status
  ON sofia_tickets (contrato, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_scheduled_messages_send_after
  ON scheduled_messages (send_after, sent) WHERE sent = false;

ANALYZE;
