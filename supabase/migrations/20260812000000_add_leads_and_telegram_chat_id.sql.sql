/*
# AgentKu — Add leads table and telegram_chat_id to agents

## Overview
Adds lead capture functionality for chat interactions and per-agent Telegram notifications.

## Changes
1. Add `telegram_chat_id` column to `agents` table
2. Create `leads` table to store captured lead information
*/

-- Add telegram_chat_id to agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS telegram_chat_id text;

-- Update column grants to include telegram_chat_id
GRANT UPDATE (
  agent_name, welcome_message, owner_name, owner_email, owner_phone, telegram_chat_id
) ON agents TO anon, authenticated;

-- Create leads table
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

-- Agents can read their own leads (via service role in backend)
DROP POLICY IF EXISTS "service_role_manage_leads" ON leads;
CREATE POLICY "service_role_manage_leads"
  ON leads FOR ALL
  TO service_role USING (true);

-- Index for agent lead lookups
CREATE INDEX IF NOT EXISTS idx_leads_agent_id ON leads(agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
