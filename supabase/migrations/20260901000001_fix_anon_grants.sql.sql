-- ============================================================
-- Fix anon role SELECT on agents table
-- ============================================================
-- 1. Make sure RLS is enabled
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- 2. Drop and recreate policy to include all relevant statuses
DROP POLICY IF EXISTS "anon_select_paid_agents" ON agents;
CREATE POLICY "anon_select_paid_agents"
  ON agents FOR SELECT
  TO anon, authenticated
  USING (payment_status IN ('PENDING', 'PAID', 'TRIAL', 'EXPIRED'));

-- 3. Grant SELECT at TABLE level (not just column level)
GRANT SELECT, INSERT, UPDATE ON agents TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON transactions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON leads TO service_role;
