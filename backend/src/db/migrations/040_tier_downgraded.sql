-- backend/src/db/migrations/040_tier_downgraded.sql
-- Executar no Supabase SQL Editor
--
-- Visibilidade de downgrade de tier complex (Anthropic → DeepSeek): hoje,
-- quando classifyMessageComplexity() marca uma mensagem como tier='complex'
-- (Procon/Anatel/judicial) mas ANTHROPIC_API_KEY está ausente, ou quando a
-- chamada à Anthropic falha em runtime e cai no fallback configurado,
-- interaction_logs.llm_provider só grava o provider que FOI usado
-- (ex.: 'deepseek') — nenhum campo indica que o tier pedia Anthropic e não
-- recebeu. tier_downgraded torna essa degradação auditável sem precisar
-- cruzar logs do Railway.
--
-- Nota de numeração: o plano original desta investigação previa esta
-- migration como 039_tier_downgraded.sql, mas 039 já foi ocupado por
-- 039_billing_notification_lock.sql (fix de TOCTOU aplicado em sessão
-- anterior) — renumerada para 040 para manter a sequência.

ALTER TABLE interaction_logs
  ADD COLUMN IF NOT EXISTS tier_downgraded BOOLEAN;

GRANT ALL ON TABLE interaction_logs TO service_role;
