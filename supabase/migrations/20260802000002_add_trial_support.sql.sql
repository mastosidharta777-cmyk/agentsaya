/*
# Add trial support to agents table

## Overview
Adds support for trial plans with trial_ends_at column and updates payment_status to include 'TRIAL' status.

## Changes
- Add `trial_ends_at` column to agents table
- Update payment_status check to include 'TRIAL' as valid status
- Add index for trial_ends_at for efficient queries
*/

-- Add trial_ends_at column
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Add index for trial_ends_at
CREATE INDEX IF NOT EXISTS idx_agents_trial_ends_at ON agents(trial_ends_at);

-- Update payment_status check to include TRIAL (EXPIRED will be added later)
ALTER TABLE agents 
DROP CONSTRAINT IF EXISTS agents_payment_status_check;

ALTER TABLE agents 
ADD CONSTRAINT agents_payment_status_check 
CHECK (payment_status IN ('PENDING','PAID','TRIAL'));

-- Update RLS policy to allow SELECT for TRIAL agents
DROP POLICY IF EXISTS "anon_select_paid_agents" ON agents;
CREATE POLICY "anon_select_paid_agents"
  ON agents FOR SELECT
  TO anon, authenticated
  USING (payment_status = 'PAID' OR payment_status = 'TRIAL');

-- Update column grants to include trial_ends_at and plan_tier
REVOKE SELECT ON agents FROM anon, authenticated;
GRANT SELECT (
  id, agent_name, welcome_message, custom_agent_slug,
  payment_status, plan_tier, period_end, trial_ends_at, created_at
) ON agents TO anon, authenticated;

-- Update INSERT grants to include trial_ends_at and plan_tier
REVOKE INSERT ON agents FROM anon, authenticated;
GRANT INSERT (
  agent_name, knowledge_base, system_prompt, welcome_message,
  custom_agent_slug, payment_status, transaction_id,
  owner_name, owner_email, owner_phone, amount, plan_tier, trial_ends_at
) ON agents TO anon, authenticated;
