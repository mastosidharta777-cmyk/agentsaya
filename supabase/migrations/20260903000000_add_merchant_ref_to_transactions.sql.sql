-- Add merchant_ref to transactions table

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS merchant_ref text;

CREATE INDEX IF NOT EXISTS idx_transactions_merchant_ref ON transactions(merchant_ref);
