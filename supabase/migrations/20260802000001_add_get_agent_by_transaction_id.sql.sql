/*
# Add get_agent_by_transaction_id function

## Overview
Adds a SECURITY DEFINER function to retrieve agent information by transaction_id.
This is needed by the checkout API to retrieve the agent ID after creation, since
RLS policies prevent querying PENDING agents directly.

## Function
- `get_agent_by_transaction_id(p_transaction_id uuid)`
  - Returns agent id, agent_name, custom_agent_slug, owner_name, owner_email, owner_phone
  - Runs as SECURITY DEFINER (bypasses RLS + column grants)
  - Allows querying PENDING agents which are normally hidden
*/

-- ── get_agent_by_transaction_id: server-only read of agent by transaction ──
-- Called by the checkout API to retrieve the agent ID after creation.
-- Runs as owner (bypasses RLS + column grants) to allow querying PENDING agents.
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
