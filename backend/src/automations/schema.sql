-- Run this in the Supabase SQL Editor
CREATE TABLE IF NOT EXISTS billing_notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text        NOT NULL,
  phone       text        NOT NULL,
  type        text        NOT NULL,   -- 'd3' | 'd0' | 'overdue_d3' | 'suspended_d5'
  status      text        NOT NULL DEFAULT 'sent',  -- 'sent' | 'cancelled'
  sent_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_notifications_lookup
  ON billing_notifications (customer_id, type, sent_at);
