-- backend/src/db/migrations/038_response_placeholder.sql
-- Executar no Supabase SQL Editor
--
-- Fix de vazamento cross-cliente do PIX Token Vault (auditoria pré go-live):
-- conversation_quality.key_phrases (nps-flow.ts) lia interaction_logs.response,
-- que guarda o texto JÁ RESOLVIDO — com o código PIX real embutido — e podia
-- reintroduzir esse código no prompt de QUALQUER outro cliente do mesmo
-- tenant/session_mode via buildQualityExamples (skill/prompt-builder.ts).
--
-- response_placeholder guarda a mesma versão com "{{PIX_xxxxxxxx}}" ainda não
-- resolvido, idêntica à salva em conversation_threads via saveMessage — nunca
-- contém payload PIX real. NULL para linhas históricas (não há placeholder
-- equivalente recuperável); código novo sempre preenche.

ALTER TABLE interaction_logs
  ADD COLUMN IF NOT EXISTS response_placeholder TEXT;

GRANT ALL ON TABLE interaction_logs TO service_role;
