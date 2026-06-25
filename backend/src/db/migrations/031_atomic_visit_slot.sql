-- Migration 031: atomic visit slot booking via RPC
-- Prevents TOCTOU double-booking: check + insert in one transaction with row lock

CREATE OR REPLACE FUNCTION book_visit_slot(
  p_date DATE,
  p_period TEXT,
  p_tenant_id TEXT,
  p_contrato TEXT,
  p_phone TEXT,
  p_type TEXT,
  p_address TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
  v_id UUID;
BEGIN
  -- Conta visitas no slot dentro da mesma transação com lock
  SELECT COUNT(*) INTO v_count
  FROM scheduled_visits
  WHERE visit_date = p_date
    AND period = p_period
    AND status = 'scheduled'
  FOR UPDATE;

  IF v_count >= 1 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'periodo_indisponivel');
  END IF;

  INSERT INTO scheduled_visits (
    tenant_id, contrato, phone, visit_date, period,
    type, address, notes, status
  )
  VALUES (
    p_tenant_id, p_contrato, p_phone, p_date, p_period,
    p_type, p_address, p_notes, 'scheduled'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'visit_id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION book_visit_slot TO service_role;
