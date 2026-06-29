-- Migration 034: adiciona reminder_sent e followup_sent em scheduled_visits
-- Usadas por visit-followup.ts (cron horário e 18h diário)
-- Executar no Supabase SQL Editor

ALTER TABLE scheduled_visits
  ADD COLUMN IF NOT EXISTS reminder_sent  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_sent  BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_scheduled_visits_reminder
  ON scheduled_visits(visit_date, reminder_sent)
  WHERE reminder_sent = false;

CREATE INDEX IF NOT EXISTS idx_scheduled_visits_followup
  ON scheduled_visits(visit_date, followup_sent)
  WHERE followup_sent = false;

-- Grants (prevenir perda por manutenção do Supabase)
GRANT ALL ON TABLE scheduled_visits TO service_role;
