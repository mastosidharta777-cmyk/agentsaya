-- ============================================================
-- Agent Saya — Complete Database Setup for Fresh Supabase Project
-- ============================================================
-- Copy ALL of this script into Supabase SQL Editor and Run
-- ============================================================

-- ============================================================
-- 1. TRANSACTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_ref text UNIQUE NOT NULL,
  gateway_reference text,
  package_id text NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text NOT NULL,
  amount integer NOT NULL,
  status text NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID','PAID','EXPIRED','FAILED')),
  payment_method text,
  payment_status text,
  reference text,
  qris_string text,
  qris_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_transactions" ON transactions;
CREATE POLICY "anon_select_transactions"
  ON transactions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_transactions" ON transactions;
CREATE POLICY "anon_insert_transactions"
  ON transactions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_transactions" ON transactions;
CREATE POLICY "anon_update_transactions"
  ON transactions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(gateway_reference);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- ============================================================
-- 2. AGENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name text NOT NULL,
  knowledge_base text NOT NULL,
  system_prompt text NOT NULL,
  welcome_message text NOT NULL,
  custom_agent_slug text NOT NULL UNIQUE,
  payment_status text NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING','PAID','TRIAL')),
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  owner_name text NOT NULL,
  owner_email text NOT NULL,
  owner_phone text NOT NULL,
  telegram_chat_id text,
  amount integer NOT NULL DEFAULT 49000,
  plan_tier text NOT NULL DEFAULT 'basic',
  period_start timestamptz,
  period_end timestamptz,
  trial_ends_at timestamptz,
  referral_code text UNIQUE,
  referred_by uuid REFERENCES agents(id) ON DELETE SET NULL,
  referral_bonus_days integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agents_slug ON agents(custom_agent_slug);
CREATE INDEX IF NOT EXISTS idx_agents_payment_status ON agents(payment_status);
CREATE INDEX IF NOT EXISTS idx_agents_trial_ends_at ON agents(trial_ends_at);
CREATE INDEX IF NOT EXISTS idx_agents_referral_code ON agents(referral_code);
CREATE INDEX IF NOT EXISTS idx_agents_referred_by ON agents(referred_by);

-- RLS Policies
DROP POLICY IF EXISTS "anon_select_paid_agents" ON agents;
CREATE POLICY "anon_select_paid_agents"
  ON agents FOR SELECT
  TO anon, authenticated
  USING (payment_status = 'PAID' OR payment_status = 'TRIAL');

DROP POLICY IF EXISTS "anon_insert_agents" ON agents;
CREATE POLICY "anon_insert_agents"
  ON agents FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_agents" ON agents;
CREATE POLICY "anon_update_agents"
  ON agents FOR UPDATE
  TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Column Grants
REVOKE SELECT ON agents FROM anon, authenticated;
GRANT SELECT (
  id, agent_name, welcome_message, custom_agent_slug,
  payment_status, plan_tier, period_end, trial_ends_at, created_at,
  referral_code, referral_bonus_days
) ON agents TO anon, authenticated;

REVOKE INSERT ON agents FROM anon, authenticated;
GRANT INSERT (
  agent_name, knowledge_base, system_prompt, welcome_message,
  custom_agent_slug, payment_status, transaction_id,
  owner_name, owner_email, owner_phone, telegram_chat_id,
  amount, plan_tier, trial_ends_at,
  referral_code, referred_by
) ON agents TO anon, authenticated;

REVOKE UPDATE ON agents FROM anon, authenticated;
GRANT UPDATE (
  agent_name, welcome_message, owner_name, owner_email, owner_phone,
  telegram_chat_id, knowledge_base, period_end, referral_bonus_days
) ON agents TO anon, authenticated;

-- ============================================================
-- 3. Add agent_id to transactions after agents table exists
-- ============================================================
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS agent_id uuid;
ALTER TABLE transactions ADD CONSTRAINT transactions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_agent_id ON transactions(agent_id);

-- ============================================================
-- 4. LEADS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  customer_name text NOT NULL DEFAULT 'Pengguna Chat',
  customer_phone text NOT NULL,
  message_summary text NOT NULL,
  source text NOT NULL DEFAULT 'chat',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_manage_leads" ON leads;
CREATE POLICY "service_role_manage_leads"
  ON leads FOR ALL
  TO service_role USING (true);

CREATE INDEX IF NOT EXISTS idx_leads_agent_id ON leads(agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- ============================================================
-- 5. FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION get_agent_context(p_slug text)
RETURNS TABLE (
  id uuid,
  agent_name text,
  knowledge_base text,
  system_prompt text,
  welcome_message text,
  payment_status text,
  period_end timestamptz,
  trial_ends_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id, a.agent_name, a.knowledge_base, a.system_prompt,
    a.welcome_message, a.payment_status, a.period_end, a.trial_ends_at
  FROM agents a
  WHERE a.custom_agent_slug = p_slug
    AND (a.payment_status = 'PAID' OR a.payment_status = 'TRIAL')
    AND (
      (a.payment_status = 'PAID' AND (a.period_end IS NULL OR a.period_end > now()))
      OR
      (a.payment_status = 'TRIAL' AND (a.trial_ends_at IS NULL OR a.trial_ends_at > now()))
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_agent_context FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION get_agent_context TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_agent_by_transaction_id(p_transaction_id uuid)
RETURNS TABLE (
  id uuid,
  agent_name text,
  custom_agent_slug text,
  owner_name text,
  owner_email text,
  owner_phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id, a.agent_name, a.custom_agent_slug,
    a.owner_name, a.owner_email, a.owner_phone
  FROM agents a
  WHERE a.transaction_id = p_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_agent_by_transaction_id FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION get_agent_by_transaction_id TO anon, authenticated;

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
  SELECT id, package_id INTO v_tx_id, v_package_id
  FROM transactions
  WHERE merchant_ref = p_merchant_ref
     OR gateway_reference = p_reference
  LIMIT 1;

  IF v_tx_id IS NULL THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_package_id = 'yearly' THEN
    v_period_days := 365;
  ELSE
    v_period_days := 30;
  END IF;

  UPDATE transactions
  SET status = 'PAID', paid_at = v_now
  WHERE id = v_tx_id AND status <> 'PAID';

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

REVOKE EXECUTE ON FUNCTION activate_agent FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION activate_agent TO anon, authenticated;

CREATE OR REPLACE FUNCTION process_referral_bonus(p_new_agent_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id uuid;
  v_now timestamptz := now();
BEGIN
  SELECT referred_by INTO v_referrer_id
  FROM agents
  WHERE id = p_new_agent_id AND referred_by IS NOT NULL;

  IF v_referrer_id IS NOT NULL THEN
    UPDATE agents
    SET
      period_end = COALESCE(period_end, v_now) + interval '7 days',
      referral_bonus_days = referral_bonus_days + 7,
      updated_at = v_now
    WHERE id = v_referrer_id
      AND payment_status = 'PAID';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION process_referral_bonus FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION process_referral_bonus TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_referral_stats(p_agent_id uuid)
RETURNS TABLE (
  total_referred bigint,
  total_bonus_days integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) as total_referred,
    COALESCE(SUM(referral_bonus_days), 0) as total_bonus_days
  FROM agents
  WHERE id = p_agent_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_referral_stats FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION get_referral_stats TO anon, authenticated;

CREATE OR REPLACE FUNCTION count_referrals(p_agent_id uuid)
RETURNS TABLE (
  total_referred bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT COUNT(*) as total_referred
  FROM agents
  WHERE referred_by = p_agent_id
    AND payment_status = 'PAID';
END;
$$;

REVOKE EXECUTE ON FUNCTION count_referrals FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION count_referrals TO anon, authenticated;

CREATE OR REPLACE FUNCTION expire_trial()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE agents
  SET payment_status = 'EXPIRED'
  WHERE payment_status = 'TRIAL'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now();
END;
$$;

REVOKE EXECUTE ON FUNCTION expire_trial FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION expire_trial TO anon, authenticated;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agents_set_updated_at ON agents;
CREATE TRIGGER agents_set_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 6. SEED PACKAGES (optional, legacy table kept for reference)
-- ============================================================
CREATE TABLE IF NOT EXISTS packages (
  id text PRIMARY KEY,
  tier text NOT NULL CHECK (tier IN ('starter','pro','elite')),
  name text NOT NULL,
  developer text NOT NULL,
  description text NOT NULL,
  price_monthly integer NOT NULL,
  features text[] NOT NULL DEFAULT '{}',
  pickaxe_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_packages" ON packages;
CREATE POLICY "anon_select_packages"
  ON packages FOR SELECT
  TO anon, authenticated USING (true);

INSERT INTO packages (id, tier, name, developer, description, price_monthly, features, pickaxe_url) VALUES
  ('pk-summarecon-serpong', 'starter', 'AI Sales Summarecon Serpong', 'Summarecon',
   'Antar layanan AI untuk proyek perumahan Summarecon Serpong. Jawab calon pembeli 24/7 di WhatsApp.',
   300000,
   ARRAY['AI chatbot via WhatsApp','Info cluster, type & harga','Simulasi KPR otomatis','Follow-up lead otomatis','1 unit AI Agent'],
   'https://pickaxe.ai/u/agentku/summarecon-serpong'),
  ('pk-alam-sutera', 'pro', 'AI Sales Alam Sutera', 'Alam Sutera',
   'Agent AI kelas pro untuk portfolio Alam Sutera. Kualifikasi lead & booking viewing tanpa operator.',
   500000,
   ARRAY['Semua fitur Starter','Kualifikasi lead pintar','Booking viewing otomatis','Multi-bahasa (ID / EN)','Integrasi CRM export','2 unit AI Agent'],
   'https://pickaxe.ai/u/agentku/alam-sutera'),
  ('pk-bsc', 'elite', 'AI Sales BSC Premium', 'Bumi Serpong Damai',
   'Solusi elite untuk project premium BSC. Personalisasi penuh + analitik penjualan real-time.',
   750000,
   ARRAY['Semua fitur Pro','Custom knowledge base','Analitik real-time dashboard','Priority support 24/7','White-label WhatsApp','5 unit AI Agent'],
   'https://pickaxe.ai/u/agentku/bsc-premium')
ON CONFLICT (id) DO UPDATE SET
  tier = EXCLUDED.tier,
  name = EXCLUDED.name,
  developer = EXCLUDED.developer,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  features = EXCLUDED.features,
  pickaxe_url = EXCLUDED.pickaxe_url;

-- ============================================================
-- DONE
-- ============================================================
-- Verify by running:
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'agents' ORDER BY ordinal_position;
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'transactions' ORDER BY ordinal_position;
-- ============================================================
