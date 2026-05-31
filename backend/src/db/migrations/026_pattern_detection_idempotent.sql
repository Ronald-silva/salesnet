-- Rode SOMENTE se 026_pattern_detection.sql falhou com "already exists".
-- Cria a tabela só se faltar; aplica RLS se a tabela já existir.

CREATE TABLE IF NOT EXISTS operational_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  alert_type TEXT NOT NULL
    CHECK (alert_type IN (
      'outage_cluster',
      'billing_spike',
      'churn_wave',
      'slow_speed_cluster',
      'nps_drop'
    )),
  affected_area TEXT,
  affected_count INTEGER,
  details JSONB,
  status TEXT DEFAULT 'open'
    CHECK (status IN ('open','acknowledged','resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS operational_alerts_tenant_status_idx
  ON operational_alerts (tenant_id, status);
CREATE INDEX IF NOT EXISTS operational_alerts_tenant_created_idx
  ON operational_alerts (tenant_id, created_at DESC);

ALTER TABLE operational_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE operational_alerts FROM anon, authenticated;

DROP POLICY IF EXISTS "service_role_only" ON operational_alerts;
CREATE POLICY "service_role_only" ON operational_alerts
  USING (auth.role() = 'service_role');

GRANT ALL ON TABLE operational_alerts TO service_role;
