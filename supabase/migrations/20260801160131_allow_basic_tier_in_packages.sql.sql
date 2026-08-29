/*
# Allow 'basic' tier in packages table

The packages table was created with a CHECK constraint restricting tier to
('starter','pro','elite'). The new builder platform uses a single 'basic'
plan referenced by transactions.package_id (FK). This widens the constraint
to include 'basic' and inserts the basic plan row so the FK is satisfied.

No data is lost — the existing three seed rows remain untouched.
*/

ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_tier_check;

ALTER TABLE packages ADD CONSTRAINT packages_tier_check
  CHECK (tier IN ('starter','pro','elite','basic'));

INSERT INTO packages (id, tier, name, developer, description, price_monthly, features, pickaxe_url)
VALUES ('plan-basic', 'basic', 'Basic Plan', 'Agent Saya', '1 AI Agent dengan custom knowledge base', 49000, ARRAY['1 AI Agent custom','Knowledge base sendiri','Link shareable','Embed code','Aktif 30 hari'], 'https://agentsaya.site')
ON CONFLICT (id) DO NOTHING;
