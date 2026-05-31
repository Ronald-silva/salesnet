-- 023_cpf_index.sql
-- Índice local de CPF por thread (telefone WhatsApp ↔ cpf). Identificação primária
-- via SGP consultacliente com parâmetro cpf= (11 dígitos). Gravamos cpf quando o
-- cliente informa ou quando encontramos pelo telefone, para contatos futuros.

ALTER TABLE conversation_threads
  ADD COLUMN IF NOT EXISTS cpf TEXT;

CREATE INDEX IF NOT EXISTS idx_conversation_threads_cpf
  ON conversation_threads (cpf)
  WHERE cpf IS NOT NULL;
