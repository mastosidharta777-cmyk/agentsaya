/*
# Add Referral System to Agent Saya

## Overview
Adds referral tracking capabilities to the agents table:
- referral_code: unique code for each agent owner to share
- referred_by: tracks which agent referred this one (foreign key to agents.id)
- referral_bonus_days: tracks total bonus days earned from referrals

## Changes
1. Add referral_code column to agents table (unique, nullable)
2. Add referred_by column to agents table (FK to agents.id, nullable)
3. Add referral_bonus_days column to agents table (integer, default 0)
4. Update column grants to include new columns
5. Create index for referral lookups
6. Create SECURITY DEFINER function to process referral bonuses
*/

-- Add referral columns to agents table
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES agents(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS referral_bonus_days integer NOT NULL DEFAULT 0;

-- Create index for referral code lookups
CREATE INDEX IF NOT EXISTS idx_agents_referral_code ON agents(referral_code);
CREATE INDEX IF NOT EXISTS idx_agents_referred_by ON agents(referred_by);

-- Update column grants to include new referral columns
REVOKE SELECT ON agents FROM anon, authenticated;
GRANT SELECT (
  id, agent_name, welcome_message, custom_agent_slug,
  payment_status, plan_tier, period_end, created_at,
  referral_code, referral_bonus_days
) ON agents TO anon, authenticated;

REVOKE INSERT ON agents FROM anon, authenticated;
GRANT INSERT (
  agent_name, knowledge_base, system_prompt, welcome_message,
  custom_agent_slug, payment_status, transaction_id,
  owner_name, owner_email, owner_phone, amount, plan_tier,
  referral_code, referred_by
) ON agents TO anon, authenticated;

REVOKE UPDATE ON agents FROM anon, authenticated;
GRANT UPDATE (
  agent_name, welcome_message, owner_name, owner_email, owner_phone,
  knowledge_base, period_end, referral_bonus_days
) ON agents TO anon, authenticated;

-- Create SECURITY DEFINER function to process referral bonuses
-- This function adds +7 days to the referrer's subscription when someone they referred pays
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
  -- Get the referrer ID from the new agent
  SELECT referred_by INTO v_referrer_id
  FROM agents
  WHERE id = p_new_agent_id AND referred_by IS NOT NULL;

  -- If there's a referrer, add bonus days
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

-- Create SECURITY DEFINER function to get referral stats for an agent
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

-- Create SECURITY DEFINER function to count referrals made by an agent
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
  SELECT
    COUNT(*) as total_referred
  FROM agents
  WHERE referred_by = p_agent_id
    AND payment_status = 'PAID';
END;
$$;

REVOKE EXECUTE ON FUNCTION count_referrals FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION count_referrals TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION get_referral_stats FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION get_referral_stats TO anon, authenticated;
