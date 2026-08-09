/*
# Update get_agent_context function to support trial agents

## Overview
Updates the get_agent_context function to include TRIAL status and trial_ends_at validation.

## Changes
- Add trial_ends_at to return columns
- Update WHERE clause to accept PAID or TRIAL status
- Add trial validation logic
*/

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
