-- Run once in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS conversation_threads (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      text        UNIQUE NOT NULL,
  messages   jsonb       NOT NULL DEFAULT '[]',
  human_mode boolean     NOT NULL DEFAULT false,
  churn_risk boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interaction_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      text        NOT NULL,
  tool_calls jsonb       NOT NULL DEFAULT '[]',
  response   text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_threads_phone_idx ON conversation_threads (phone);
CREATE INDEX IF NOT EXISTS interaction_logs_phone_idx     ON interaction_logs (phone);
