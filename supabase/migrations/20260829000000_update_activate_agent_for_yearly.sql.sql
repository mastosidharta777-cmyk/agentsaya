-- Update activate_agent function to support yearly plans

CREATE OR REPLACE FUNCTION activate_agent(p_merchant_ref text, p_reference text)
RETURNS TABLE (
  agent_id uuid,
  agent_name text,
  custom_agent_slug text,
  owner_name text,
  owner_email text,
  owner_phone text,
  amount integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
  v_now timestamptz := now();
  v_package_id text;
  v_period_days int;
BEGIN
  -- find the transaction by merchant_ref or gateway reference
  SELECT id, package_id INTO v_tx_id, v_package_id
  FROM transactions
  WHERE merchant_ref = p_merchant_ref
     OR gateway_reference = p_reference
  LIMIT 1;

  IF v_tx_id IS NULL THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  -- Determine period based on package_id
  IF v_package_id = 'yearly' THEN
    v_period_days := 365;
  ELSE
    v_period_days := 30;
  END IF;

  -- mark transaction PAID (idempotent)
  UPDATE transactions
  SET status = 'PAID', paid_at = v_now
  WHERE id = v_tx_id AND status <> 'PAID';

  -- activate the linked agent + set period window (idempotent)
  UPDATE agents
  SET
    payment_status = 'PAID',
    period_start = COALESCE(period_start, v_now),
    period_end = COALESCE(period_end, v_now + (v_period_days || ' days')::interval),
    updated_at = v_now
  WHERE transaction_id = v_tx_id AND payment_status <> 'PAID';

  RETURN QUERY
  SELECT
    a.id, a.agent_name, a.custom_agent_slug,
    a.owner_name, a.owner_email, a.owner_phone, a.amount
  FROM agents a
  WHERE a.transaction_id = v_tx_id;
END;
$$;
