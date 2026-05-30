-- 024_quality_feedback.sql
-- Feedback loop de qualidade: liga o NPS real do cliente à conversa que o gerou.
-- Cada resposta NPS cria automaticamente um exemplo de boa/má conversa que é
-- reinjetado no prompt da Sofia (few-shot baseado em feedback real).

CREATE TABLE conversation_quality (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  session_id TEXT NOT NULL,
  nps_score INTEGER CHECK (nps_score BETWEEN 1 AND 5),
  session_mode TEXT,
  message_count INTEGER,
  resolved_without_human BOOLEAN,
  tools_used TEXT[],
  key_phrases TEXT[],
  marked_as_example BOOLEAN DEFAULT false,
  example_type TEXT CHECK (example_type IN ('good','bad')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON conversation_quality (tenant_id, nps_score);
CREATE INDEX ON conversation_quality (tenant_id, example_type)
  WHERE marked_as_example = true;

-- Mesma política das demais tabelas: acesso somente via service_role.
ALTER TABLE conversation_quality ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE conversation_quality FROM anon, authenticated;
