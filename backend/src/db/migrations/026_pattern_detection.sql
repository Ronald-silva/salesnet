-- 026_pattern_detection.sql
-- Detecção de padrões operacionais: um cron varre os dados de atendimento a cada
-- 30 min e abre alertas quando detecta anomalias em escala (cluster de quedas,
-- spike de cobrança, onda de churn, cluster de lentidão, queda de NPS) antes que
-- virem reclamação massiva. Cada alerta é notificado ao admin via WhatsApp.

CREATE TABLE operational_alerts (
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

CREATE INDEX ON operational_alerts (tenant_id, status);
CREATE INDEX ON operational_alerts (tenant_id, created_at DESC);

-- Mesma política das demais tabelas: acesso somente via service_role.
ALTER TABLE operational_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE operational_alerts FROM anon, authenticated;
