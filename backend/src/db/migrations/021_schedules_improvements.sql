-- 021_schedules_improvements.sql
-- Campos adicionais para a gestão de agendamentos (visitas técnicas)
-- no painel admin: tipo, endereço, notas e timestamps de ciclo de vida.

ALTER TABLE scheduled_visits
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'manutencao'
    CHECK (type IN ('instalacao', 'manutencao')),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_scheduled_visits_status
  ON scheduled_visits (status, visit_date DESC);

CREATE INDEX IF NOT EXISTS idx_scheduled_visits_phone
  ON scheduled_visits (phone);
