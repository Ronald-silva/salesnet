-- Migration 017 — Idempotent WhatsApp message processing

CREATE TABLE IF NOT EXISTS processed_message_ids (
  message_id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON processed_message_ids (processed_at);
