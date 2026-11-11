-- Apply together with the Mayar checkout release, after backing up DB and verifying env.
-- Do NOT run before switching server routes to service_role; public read scope changes.
BEGIN;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS mayar_request_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS mayar_initial_transaction_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS mayar_settled_transaction_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS mayar_checkout_url text;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_mayar_request_unique
  ON public.transactions(mayar_request_id) WHERE mayar_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_mayar_settled_unique
  ON public.transactions(mayar_settled_transaction_id) WHERE mayar_settled_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_mayar_order_unique
  ON public.transactions(merchant_ref) WHERE payment_method = 'mayar';
-- Only the trusted server using service_role may finalize a provider-verified settlement.
CREATE OR REPLACE FUNCTION public.finalize_mayar_agent_payment(
  p_order_id uuid, p_request_id uuid, p_settled_transaction_id uuid,
  p_amount numeric, p_email text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_duration interval;
  v_plan text;
  v_updated uuid;
BEGIN
  SELECT * INTO v_tx FROM public.transactions
  WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown order'; END IF;
  IF v_tx.payment_method IS DISTINCT FROM 'mayar'
     OR v_tx.mayar_request_id IS DISTINCT FROM p_request_id
     OR v_tx.amount IS DISTINCT FROM p_amount
     OR lower(trim(v_tx.customer_email)) IS DISTINCT FROM lower(trim(p_email)) THEN
    RAISE EXCEPTION 'Mayar settlement binding mismatch';
  END IF;
  IF v_tx.status = 'PAID' THEN
    IF v_tx.mayar_settled_transaction_id = p_settled_transaction_id THEN RETURN FALSE; END IF;
    RAISE EXCEPTION 'Order already finalized with a different transaction';
  END IF;
  IF v_tx.status IS DISTINCT FROM 'UNPAID' OR v_tx.mayar_initial_transaction_id IS NULL
     OR v_tx.agent_id IS NULL OR p_settled_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Order is not eligible for settlement';
  END IF;
  IF v_tx.package_id = 'yearly' THEN
    v_plan := 'yearly';
    v_duration := interval '365 days';
  ELSIF v_tx.package_id = 'plan-basic' THEN
    v_plan := 'basic';
    v_duration := interval '30 days';
  ELSE
    RAISE EXCEPTION 'Unsupported paid package';
  END IF;
  UPDATE public.transactions
  SET status='PAID', payment_status='PAID',
      mayar_settled_transaction_id=p_settled_transaction_id,
      reference=p_settled_transaction_id::text, paid_at=now()
  WHERE id=v_tx.id AND status='UNPAID';
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment transition failed'; END IF;
  UPDATE public.agents
  SET payment_status='PAID', status='active', plan_tier=v_plan,
      period_start=COALESCE(period_start,now()),
      period_end=GREATEST(COALESCE(period_end,now()),now())+v_duration,
      updated_at=now()
  WHERE id=v_tx.agent_id RETURNING id INTO v_updated;
  IF v_updated IS NULL THEN RAISE EXCEPTION 'Agent for payment not found'; END IF;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_mayar_agent_payment(uuid,uuid,uuid,numeric,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_mayar_agent_payment(uuid,uuid,uuid,numeric,text)
  TO service_role;

-- Remove privilege-escalating public RPCs. Server uses service_role directly.
REVOKE ALL ON FUNCTION public.activate_agent(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_agent_by_transaction_id(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_agent_context(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.process_referral_bonus(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.expire_trial() FROM PUBLIC,anon,authenticated;

-- Remove permissive policies. Public may read only published chat identity,
-- never private knowledge bases, payment data, leads or owner contact details.
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public agents" ON public.agents;
DROP POLICY IF EXISTS "Public insert agents" ON public.agents;
DROP POLICY IF EXISTS "Public read agents" ON public.agents;
DROP POLICY IF EXISTS "Public update agents" ON public.agents;
DROP POLICY IF EXISTS "anon_insert_agents" ON public.agents;
DROP POLICY IF EXISTS "anon_update_agents" ON public.agents;
DROP POLICY IF EXISTS "anon_select_paid_agents" ON public.agents;
DROP POLICY IF EXISTS "Public transactions" ON public.transactions;
DROP POLICY IF EXISTS "Public insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Public select transactions" ON public.transactions;
DROP POLICY IF EXISTS "anon_insert_transactions" ON public.transactions;
DROP POLICY IF EXISTS "anon_update_transactions" ON public.transactions;
DROP POLICY IF EXISTS "anon_select_transactions" ON public.transactions;
DROP POLICY IF EXISTS "Allow full access for leads" ON public.leads;
CREATE POLICY "public_chat_read" ON public.agents FOR SELECT TO anon,authenticated
USING (
  (payment_status='PAID' AND period_end > now())
  OR (payment_status='TRIAL' AND trial_ends_at > now())
);
REVOKE ALL ON public.agents, public.transactions, public.leads FROM PUBLIC,anon,authenticated;
GRANT SELECT (agent_name,welcome_message,custom_agent_slug)
  ON public.agents TO anon,authenticated;
-- Explicit service_role permissions remain as configured by Supabase.
COMMIT;
