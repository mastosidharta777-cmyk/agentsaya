/*
# Add function to expire trial agents

## Overview
Adds a function to mark expired trial agents and update their status.

## Function
- `expire_trial_agents()` - Marks trial agents as expired when trial period ends
*/

CREATE OR REPLACE FUNCTION expire_trial_agent(p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE agents
  SET payment_status = 'EXPIRED'
  WHERE custom_agent_slug = p_slug
    AND payment_status = 'TRIAL'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now();
END;
$$;

REVOKE EXECUTE ON FUNCTION expire_trial_agent FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION expire_trial_agent TO anon, authenticated;
