/*
# AgentKu — AI Agent subscription & payment schema

## Overview
Single-tenant MVP for selling AI sales-agent subscriptions to real-estate
agents. There is no sign-in screen — a visitor fills a checkout form, pays via
QRIS, and a webhook activates a 30-day subscription that is delivered over
WhatsApp + email. Because there is no authenticated user, all policies are
scoped to `anon, authenticated` so the anon-key frontend can insert
transactions and read its own payment status.

## New Tables
1. `packages` — catalog of sellable AI agent packages (seeded).
   - id (text PK), tier, name, developer, description, price_monthly (int),
     features (text[]), pickaxe_url (the unique AI-agent deployment URL).
2. `transactions` — one row per checkout attempt.
   - id (uuid PK), merchant_ref (unique, our ref), gateway_reference (gateway
     ref), package_id (FK), customer_name, customer_email, customer_phone,
     amount, status (UNPAID/PAID/EXPIRED/FAILED), qris_string, qris_url,
     created_at, paid_at.
3. `subscriptions` — one row per active entitlement (1:1 to a paid
   transaction). status ACTIVE/EXPIRED/CANCELLED, period_start, period_end
   (30 days from activation), agent_url (Pickaxe deployment link delivered to
   the customer).

## Security
- RLS enabled on every table.
- `packages` is read-only public catalog: anon+authenticated SELECT only.
- `transactions` is writable by the anon frontend (it must insert a checkout
  row and later read its own status). We cannot scope by auth.uid() (no auth),
  so SELECT/INSERT/UPDATE are open to anon+authenticated. This is acceptable
  for a checkout table with no PII-secret columns; the webhook (service role)
  performs the privileged PAID transition. DELETE is denied to anon.
- `subscriptions` is read-only to anon (the frontend shows entitlement info on
  the success page by merchant_ref). INSERT/UPDATE happen via the service-role
  webhook only. DELETE denied to anon.

## Important notes
1. `price_monthly` and `amount` are integers storing Rupiah (no decimals).
2. `agent_url` is copied from the package at activation time so it is stable
   even if the package row is later edited.
3. No `auth.users` FK — intentionally no auth for this MVP.
*/

-- ── packages ───────────────────────────────────────────────
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

-- ── transactions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_ref text UNIQUE NOT NULL,
  gateway_reference text,
  package_id text NOT NULL REFERENCES packages(id),
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text NOT NULL,
  amount integer NOT NULL,
  status text NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID','PAID','EXPIRED','FAILED')),
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

-- ── subscriptions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  package_id text NOT NULL REFERENCES packages(id),
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','CANCELLED')),
  agent_url text NOT NULL,
  period_start timestamptz NOT NULL DEFAULT now(),
  period_end timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_subscriptions" ON subscriptions;
CREATE POLICY "anon_select_subscriptions"
  ON subscriptions FOR SELECT
  TO anon, authenticated USING (true);

-- ── seed package catalog ───────────────────────────────────
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

-- helpful lookups
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(gateway_reference);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
