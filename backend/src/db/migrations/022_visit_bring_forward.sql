-- 022_visit_bring_forward.sql
-- Antecipação de visitas: quando a equipe termina cedo, o operador oferece
-- ao próximo cliente a chance de antecipar a visita. Estado da oferta + janela
-- de confirmação ficam nestas colunas.

ALTER TABLE scheduled_visits
  ADD COLUMN IF NOT EXISTS bring_forward_status TEXT DEFAULT 'none'
    CHECK (bring_forward_status IN ('none', 'offered', 'accepted', 'declined', 'expired')),
  ADD COLUMN IF NOT EXISTS bring_forward_offered_at TIMESTAMPTZ;

-- Lookup rápido de ofertas pendentes por telefone (captura da resposta "SIM").
CREATE INDEX IF NOT EXISTS idx_scheduled_visits_bring_forward
  ON scheduled_visits (phone, bring_forward_status, bring_forward_offered_at);
