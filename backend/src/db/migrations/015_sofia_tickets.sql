CREATE TABLE sofia_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  contrato TEXT NOT NULL,
  sgp_chamado_id TEXT,
  tipo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  status TEXT DEFAULT 'aberto' CHECK (status IN ('aberto','em_andamento','resolvido')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON sofia_tickets (phone, tenant_id, status);
CREATE INDEX ON sofia_tickets (contrato, status);
