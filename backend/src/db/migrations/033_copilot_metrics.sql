-- backend/src/db/migrations/033_copilot_metrics.sql
-- Executar no Supabase SQL Editor

ALTER TABLE interaction_logs
  ADD COLUMN IF NOT EXISTS copilot_used BOOLEAN DEFAULT false;

ALTER TABLE interaction_logs
  ADD COLUMN IF NOT EXISTS copilot_edited BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_interaction_logs_copilot
  ON interaction_logs(tenant_id, copilot_used)
  WHERE copilot_used = true;
