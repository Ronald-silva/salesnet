-- backend/src/db/migrations/037_delivery_status.sql
-- Executar no Supabase SQL Editor
--
-- interaction_logs deixa de ser inserido apenas quando o envio ao cliente tem sucesso.
-- delivery_status reflete o resultado real do sendText (após retries); 'sent' é o default
-- para preservar o significado das linhas históricas (todas eram, de fato, entregues --
-- a falha só existia porque o insert nunca acontecia quando o envio falhava).

ALTER TABLE interaction_logs
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'sent';

ALTER TABLE interaction_logs
  ADD COLUMN IF NOT EXISTS delivery_error TEXT;

CREATE INDEX IF NOT EXISTS idx_interaction_logs_delivery_failed
  ON interaction_logs(tenant_id, created_at DESC)
  WHERE delivery_status = 'failed';
