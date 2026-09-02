-- ============================================================
-- AgentKu — RUN ALL MIGRATIONS IN ONE GO
-- ============================================================
-- CARA PAKAI:
-- 1. Buka Supabase Dashboard → SQL Editor → New query
-- 2. Copy SELURUH isi file ini
-- 3. Paste ke editor
-- 4. Klik RUN (atau Ctrl+Enter)
-- 5. Tunggu sampai "Success. No rows returned"
-- ============================================================
-- AMAN DIJALANKAN BERULANG KALI (semua statement IF EXISTS/IF NOT EXISTS)
-- ============================================================


-- ============================================================
-- MIGRATION 1: Fix transactions schema
-- (from 20260827000000_fix_transactions_schema.sql.sql)
-- ============================================================
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS package_id text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_phone text;

UPDATE transactions
SET payment_status = status
WHERE payment_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_agent_id ON transactions(agent_id);


-- ============================================================
-- MIGRATION 2: Safe migration for existing project
-- (from 20260831000000_safe_migration_for_existing_project.sql.sql)
-- ============================================================

-- 2a. Fix transactions table - add missing columns
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gateway_reference text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS qris_string text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS qris_url text;
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(gateway_reference);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- 2b. Fix agents table - add missing columns
ALTER TABLE agents ADD COLUMN IF NOT EXISTS telegram_chat_id text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS transaction_id uuid;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS plan_tier text NOT NULL DEFAULT 'basic';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS period_start timestamptz;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS period_end timestamptz;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS referred_by uuid;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS referral_bonus_days integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Update payment_status check constraint (allow EXPIRED, CANCELED)
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_payment_status_check;
ALTER TABLE agents
  ADD CONSTRAINT agents_payment_status_check
  CHECK (payment_status IN ('PENDING','PAID','TRIAL','EXPIRED','CANCELED'));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_agents_slug ON agents(custom_agent_slug);
CREATE INDEX IF NOT EXISTS idx_agents_payment_status ON agents(payment_status);
CREATE INDEX IF NOT EXISTS idx_agents_trial_ends_at ON agents(trial_ends_at);
CREATE INDEX IF NOT EXISTS idx_agents_referral_code ON agents(referral_code);
CREATE INDEX IF NOT EXISTS idx_agents_referred_by ON agents(referred_by);

-- Foreign keys
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_transaction_id_fkey;
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_referred_by_fkey;
ALTER TABLE agents ADD CONSTRAINT agents_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
ALTER TABLE agents ADD CONSTRAINT agents_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES agents(id) ON DELETE SET NULL;

-- 2c. RLS policies (transactions)
DROP POLICY IF EXISTS "anon_select_transactions" ON transactions;
CREATE POLICY "anon_select_transactions" ON transactions FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_transactions" ON transactions;
CREATE POLICY "anon_insert_transactions" ON transactions FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_transactions" ON transactions;
CREATE POLICY "anon_update_transactions" ON transactions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- 2d. RLS policies (agents) - allow anon to see all relevant statuses
DROP POLICY IF EXISTS "anon_select_paid_agents" ON agents;
CREATE POLICY "anon_select_paid_agents" ON agents FOR SELECT TO anon, authenticated USING (payment_status IN ('PENDING','PAID','TRIAL','EXPIRED'));

DROP POLICY IF EXISTS "anon_insert_agents" ON agents;
CREATE POLICY "anon_insert_agents" ON agents FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_agents" ON agents;
CREATE POLICY "anon_update_agents" ON agents FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- 2e. Column grants
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

-- 2f. Leads table
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
CREATE POLICY "service_role_manage_leads" ON leads FOR ALL TO service_role USING (true);

CREATE INDEX IF NOT EXISTS idx_leads_agent_id ON leads(agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);


-- ============================================================
-- MIGRATION 3: Update activate_agent for yearly
-- (from 20260829000000_update_activate_agent_for_yearly.sql.sql)
-- ============================================================
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


-- ============================================================
-- MIGRATION 4: get_agent_context (supports TRIAL)
-- (from 20260802000003_update_get_agent_context_for_trial.sql.sql)
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


-- ============================================================
-- MIGRATION 5: expire_trial function (cron)
-- (from 20260831000000_safe_migration_for_existing_project.sql.sql part)
-- ============================================================
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


-- ============================================================
-- MIGRATION 6: process_referral_bonus
-- ============================================================
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


-- ============================================================
-- MIGRATION 7: get_agent_by_transaction_id
-- ============================================================
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


-- ============================================================
-- MIGRATION 8: count_referrals + get_referral_stats
-- ============================================================
CREATE OR REPLACE FUNCTION count_referrals(p_agent_id uuid)
RETURNS TABLE (total_referred bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT COUNT(*)::bigint AS total_referred
  FROM agents
  WHERE referred_by = p_agent_id
    AND payment_status = 'PAID';
END;
$$;

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
    COUNT(*)::bigint AS total_referred,
    COALESCE(SUM(referral_bonus_days), 0)::integer AS total_bonus_days
  FROM agents
  WHERE id = p_agent_id;
END;
$$;


-- ============================================================
-- MIGRATION 9: Trial reminder columns
-- (from 20260901000000_add_trial_reminder_columns.sql.sql)
-- ============================================================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_trial_reminder_sent timestamptz;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_trial_reminder_stage text;

CREATE INDEX IF NOT EXISTS idx_agents_trial_reminder
  ON agents(payment_status, last_trial_reminder_sent)
  WHERE payment_status = 'TRIAL';


-- ============================================================
-- MIGRATION 10: Fix anon grants (table-level SELECT)
-- (from 20260901000001_fix_anon_grants.sql.sql)
-- ============================================================
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_paid_agents" ON agents;
CREATE POLICY "anon_select_paid_agents"
  ON agents FOR SELECT
  TO anon, authenticated
  USING (payment_status IN ('PENDING', 'PAID', 'TRIAL', 'EXPIRED'));

GRANT SELECT, INSERT, UPDATE ON agents TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON transactions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON leads TO service_role;


-- ============================================================
-- MIGRATION 11: updated_at trigger
-- ============================================================
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
-- MIGRATION 12: Revoke + grant EXECUTE on functions
-- ============================================================
REVOKE EXECUTE ON FUNCTION get_agent_context FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION get_agent_context TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION get_agent_by_transaction_id FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION get_agent_by_transaction_id TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION activate_agent FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION activate_agent TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION process_referral_bonus FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION process_referral_bonus TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION count_referrals FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION count_referrals TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION get_referral_stats FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION get_referral_stats TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION expire_trial FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION expire_trial TO anon, authenticated;


-- ============================================================
-- DONE
-- ============================================================
-- VERIFIKASI (jalankan query ini setelah migration selesai):
--
-- 1. Cek kolom agents:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'agents' ORDER BY ordinal_position;
--
-- 2. Cek constraint payment_status harus include EXPIRED & CANCELED:
--   SELECT pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conname = 'agents_payment_status_check';
--
-- 3. Cek kolom transaksi:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'transactions' ORDER BY ordinal_position;
--
-- 4. Cek semua functions exist:
--   SELECT proname FROM pg_proc
--   WHERE proname IN (
--     'activate_agent','get_agent_context','expire_trial',
--     'process_referral_bonus','count_referrals','get_referral_stats',
--     'get_agent_by_transaction_id','set_updated_at'
--   );
-- ============================================================
