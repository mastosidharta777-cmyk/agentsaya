-- Fix transactions table schema for checkout flow

-- Ensure merchant_ref and customer columns exist
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS package_id text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_phone text;

-- Backfill payment_status from status if needed
UPDATE transactions
SET payment_status = status
WHERE payment_status IS NULL;

-- Add index for agent_id
CREATE INDEX IF NOT EXISTS idx_transactions_agent_id ON transactions(agent_id);
