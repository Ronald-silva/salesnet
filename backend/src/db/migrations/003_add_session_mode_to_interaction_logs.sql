ALTER TABLE interaction_logs
  ADD COLUMN IF NOT EXISTS session_mode text;

CREATE INDEX IF NOT EXISTS interaction_logs_session_mode_idx
  ON interaction_logs (phone, session_mode, created_at);
