-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS otp_codes (
  phone       text        PRIMARY KEY,
  code        text        NOT NULL,
  expires_at  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS client_sessions (
  token       text        PRIMARY KEY,
  customer_id text        NOT NULL,
  phone       text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_sessions_expires
  ON client_sessions (expires_at);
