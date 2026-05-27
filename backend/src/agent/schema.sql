-- Run once in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS conversation_threads (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      text        NOT NULL,
  tenant_id  text        NOT NULL DEFAULT 'default',
  messages   jsonb       NOT NULL DEFAULT '[]',
  human_mode boolean     NOT NULL DEFAULT false,
  churn_risk boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interaction_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      text        NOT NULL,
  tenant_id  text        NOT NULL DEFAULT 'default',
  tool_calls jsonb       NOT NULL DEFAULT '[]',
  response   text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS conversation_threads_tenant_phone_uidx
  ON conversation_threads (tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_tenant_phone_created
  ON interaction_logs (tenant_id, phone, created_at DESC);

CREATE TABLE IF NOT EXISTS leads (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text        NOT NULL,
  name          text,
  neighborhood  text,
  desired_plan  text,
  notes         text,
  status        text        NOT NULL DEFAULT 'new',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_phone_idx  ON leads (phone);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status);
