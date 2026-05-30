-- 025_knowledge_base.sql
-- Base de conhecimento dinâmica: a Sofia registra soluções que funcionaram
-- (após o cliente confirmar a resolução) e as reutiliza em casos similares,
-- ranqueadas por success_count. Os keywords usam GIN para overlap rápido (&&).

CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('tecnico','cobranca','comercial','prospect')),
  problem_keywords TEXT[] NOT NULL,
  solution TEXT NOT NULL,
  equipment TEXT,
  success_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON knowledge_base (tenant_id, category);
CREATE INDEX ON knowledge_base USING GIN (problem_keywords);

-- Mesma política das demais tabelas: acesso somente via service_role.
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE knowledge_base FROM anon, authenticated;
