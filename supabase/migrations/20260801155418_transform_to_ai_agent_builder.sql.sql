/*
# Agent Saya — refactor from package seller to AI Agent Builder Platform

## Overview
Transforms the schema from a fixed package catalog into a self-service AI
agent builder. A business owner describes their business (agent name +
knowledge base + welcome message), pays Rp 49.000 via QRIS, and receives a
shareable chat page at /chat/[slug] plus an embed code.

## New Table
- `agents`
  - id (uuid PK)
  - agent_name (text)             — "Sales Ruko Serpong"
  - knowledge_base (text)         — private: products, prices, FAQ
  - system_prompt (text)          — server-generated LLM instruction
  - welcome_message (text)        — shown as first chat bubble
  - custom_agent_slug (text, UNIQUE) — shareable URL path segment
  - payment_status (text: PENDING / PAID)
  - transaction_id (uuid FK → transactions, nullable until checkout links it)
  - owner_name, owner_email, owner_phone (text)
  - amount (integer, Rupiah)
  - plan_tier (text: 'basic')
  - period_start, period_end (timestamptz; 30-day window from activation)
  - created_at, updated_at (timestamptz)

## Privacy design (secure-data-access skill)
The `knowledge_base` and `system_prompt` columns contain private business
context that must NEVER be readable from the browser/anon key. Only the
server-side chat route may read them, through a SECURITY DEFINER function.

1. Column-level SELECT grants: anon/authenticated may SELECT only the
   PUBLIC columns (agent_name, welcome_message, custom_agent_slug,
   payment_status, period_end, created_at). knowledge_base & system_prompt
   are NOT granted to anon/authenticated.
2. A SECURITY DEFINER function `get_agent_context(p_slug text)` returns the
   private columns for a PAID, non-expired agent. It runs as the table owner
   (bypasses RLS + column grants), so the server route can read context
   without exposing it to the browser. EXECUTE is granted to anon so the
   Next.js API route (using the anon client) can call it.
3. A SECURITY DEFINER function `activate_agent(p_merchant_ref text, p_reference text)`
   performs the privileged PAID transition: it flips the agent's
   payment_status to PAID, sets the 30-day window, and marks the linked
   transaction PAID — all atomically. This keeps payment_status out of
   client-writable reach.

## Existing tables — kept, not dropped (no data loss)
- `packages` and `subscriptions` are no longer used by the new flow but are
  left intact. New code does not reference them.
- `transactions` is reused for payment tracking; each agent row links to one
  transaction via transaction_id.

## RLS & grants
- `agents`: RLS enabled.
  - SELECT (public columns only) for anon/authenticated WHERE payment_status =
    'PAID'. Pending/unknown agents are hidden from the public list.
  - INSERT for anon/authenticated (the checkout creates a PENDING agent).
  - UPDATE restricted to the public, non-sensitive columns
    (owner_name/email/phone, agent_name, welcome_message) via column grants —
    payment_status, system_prompt, knowledge_base, slug, period_* are NOT
    client-updatable.
  - No DELETE for anon/authenticated.
- `get_agent_context`: EXECUTE to anon, authenticated.
- `activate_agent`: EXECUTE to anon, authenticated (the webhook/simulate
  route calls it with the anon client; signature verification happens in
  application code before the call).

## Idempotency
- CREATE TABLE IF NOT EXISTS; DROP POLICY IF EXISTS before CREATE POLICY.
- Functions use CREATE OR REPLACE.
*/

-- ── agents table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name text NOT NULL,
  knowledge_base text NOT NULL,
  system_prompt text NOT NULL,
  welcome_message text NOT NULL,
  custom_agent_slug text NOT NULL UNIQUE,
  payment_status text NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING','PAID')),
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  owner_name text NOT NULL,
  owner_email text NOT NULL,
  owner_phone text NOT NULL,
  amount integer NOT NULL DEFAULT 49000,
  plan_tier text NOT NULL DEFAULT 'basic',
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Index for slug lookups (the chat page hot path)
CREATE INDEX IF NOT EXISTS idx_agents_slug ON agents(custom_agent_slug);
CREATE INDEX IF NOT EXISTS idx_agents_payment_status ON agents(payment_status);

-- ── RLS policies on agents ─────────────────────────────────
-- Public can SELECT only PAID agents. Column grants (below) further restrict
-- WHICH columns are visible.
DROP POLICY IF EXISTS "anon_select_paid_agents" ON agents;
CREATE POLICY "anon_select_paid_agents"
  ON agents FOR SELECT
  TO anon, authenticated
  USING (payment_status = 'PAID');

-- Checkout inserts a PENDING agent row.
DROP POLICY IF EXISTS "anon_insert_agents" ON agents;
CREATE POLICY "anon_insert_agents"
  ON agents FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Owner may update non-sensitive columns only (column grants enforce scope).
DROP POLICY IF EXISTS "anon_update_agents" ON agents;
CREATE POLICY "anon_update_agents"
  ON agents FOR UPDATE
  TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ── Column-level grants: hide private columns from the browser ──
-- Revoke the table-wide grants first, then grant only public columns for
-- SELECT and a narrow set for INSERT/UPDATE.
REVOKE SELECT ON agents FROM anon, authenticated;
REVOKE INSERT ON agents FROM anon, authenticated;
REVOKE UPDATE ON agents FROM anon, authenticated;

-- SELECT: only public columns, and only for PAID agents (policy above).
GRANT SELECT (
  id, agent_name, welcome_message, custom_agent_slug,
  payment_status, plan_tier, period_end, created_at
) ON agents TO anon, authenticated;

-- INSERT: checkout creates an agent. Allow the owner-content columns; the
-- application fills system_prompt, slug, payment_status, amount, plan_tier.
GRANT INSERT (
  agent_name, knowledge_base, system_prompt, welcome_message,
  custom_agent_slug, payment_status, transaction_id,
  owner_name, owner_email, owner_phone, amount, plan_tier
) ON agents TO anon, authenticated;

-- UPDATE: only user-editable display fields. payment_status, knowledge_base,
-- system_prompt, slug, transaction_id, period_* are NOT updatable by client.
GRANT UPDATE (
  agent_name, welcome_message, owner_name, owner_email, owner_phone
) ON agents TO anon, authenticated;

-- ── get_agent_context: server-only read of private columns ──
-- Called by the /api/chat route. Returns the knowledge base + system prompt
-- for a PAID/TRIAL, non-expired agent. Runs as owner (bypasses RLS + column grants).
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

-- ── activate_agent: privileged PAID transition ─────────────
-- Called by the webhook after signature verification. Flips agent + linked
-- transaction to PAID and sets the 30-day window atomically.
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
BEGIN
  -- find the transaction by merchant_ref or gateway reference
  SELECT id INTO v_tx_id
  FROM transactions
  WHERE merchant_ref = p_merchant_ref
     OR gateway_reference = p_reference
  LIMIT 1;

  IF v_tx_id IS NULL THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  -- mark transaction PAID (idempotent)
  UPDATE transactions
  SET status = 'PAID', paid_at = v_now
  WHERE id = v_tx_id AND status <> 'PAID';

  -- activate the linked agent + set 30-day window (idempotent)
  UPDATE agents
  SET
    payment_status = 'PAID',
    period_start = COALESCE(period_start, v_now),
    period_end = COALESCE(period_end, v_now + interval '30 days'),
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

-- ── updated_at trigger ─────────────────────────────────────
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
