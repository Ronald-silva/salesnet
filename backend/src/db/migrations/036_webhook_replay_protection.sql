-- Migration 036: replay protection para webhooks externos (SGP, etc.)
-- Armazena fingerprint SHA-256 do raw body de cada webhook processado.
-- Inserção duplicada (código 23505) indica replay — rejeitar silenciosamente.

CREATE TABLE IF NOT EXISTS processed_webhook_ids (
  fingerprint  TEXT        PRIMARY KEY,
  source       TEXT        NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_webhook_ids_processed_at
  ON processed_webhook_ids(processed_at);

ALTER TABLE processed_webhook_ids ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'processed_webhook_ids'
      AND policyname = 'processed_webhook_ids_service_role_only'
  ) THEN
    CREATE POLICY processed_webhook_ids_service_role_only
      ON processed_webhook_ids
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON TABLE processed_webhook_ids TO service_role;
