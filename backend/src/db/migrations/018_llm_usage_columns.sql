-- Migration 018 — LLM token usage on interaction_logs

ALTER TABLE interaction_logs
  ADD COLUMN IF NOT EXISTS input_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS output_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS llm_provider TEXT,
  ADD COLUMN IF NOT EXISTS llm_model TEXT;
