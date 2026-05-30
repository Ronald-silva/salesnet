-- 023_cpf_index.sql
-- O SGP não aceita CPF como parâmetro de busca (/api/ura/consultacliente/ só
-- aceita telefone ou contrato). Mantemos um índice próprio no Supabase: quando
-- o cliente informa o CPF numa conversa, gravamos em conversation_threads.cpf
-- (associado ao phone) para localizar o contrato em contatos futuros.

ALTER TABLE conversation_threads
  ADD COLUMN IF NOT EXISTS cpf TEXT;

CREATE INDEX IF NOT EXISTS idx_conversation_threads_cpf
  ON conversation_threads (cpf)
  WHERE cpf IS NOT NULL;
