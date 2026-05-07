-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS campaign_sends (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text        NOT NULL,
  type        text        NOT NULL,   -- 'upsell' | 'referral' | 'churn_risk_high'
  sent_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_sends_lookup
  ON campaign_sends (customer_id, type, sent_at);

CREATE TABLE IF NOT EXISTS referral_links (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text        NOT NULL UNIQUE,
  code        text        NOT NULL UNIQUE,
  conversions int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS churn_risks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text        NOT NULL,
  reason      text        NOT NULL,   -- 'too_many_tickets' | 'recurring_overdue' | 'cancellation_ticket'
  level       text        NOT NULL,   -- 'low' | 'medium' | 'high'
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS churn_risks_customer
  ON churn_risks (customer_id, created_at DESC);
