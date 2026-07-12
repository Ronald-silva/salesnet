-- CPF informado no atendimento pode autorizar somente consultas financeiras por
-- uma janela curta, sem criar um vinculo permanente entre WhatsApp e titular.
ALTER TABLE conversation_threads
  ADD COLUMN IF NOT EXISTS financial_customer_id text,
  ADD COLUMN IF NOT EXISTS financial_access_expires_at timestamptz;

COMMENT ON COLUMN conversation_threads.financial_customer_id IS
  'Contrato autorizado temporariamente por CPF para fatura, PIX e confirmacao de pagamento.';
COMMENT ON COLUMN conversation_threads.financial_access_expires_at IS
  'Expiracao da autorizacao financeira temporaria; nao autoriza alteracoes contratuais.';
