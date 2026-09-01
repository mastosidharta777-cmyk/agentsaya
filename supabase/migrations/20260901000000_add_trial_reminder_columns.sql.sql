ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_trial_reminder_sent timestamptz;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_trial_reminder_stage text;

CREATE INDEX IF NOT EXISTS idx_agents_trial_reminder ON agents(payment_status, last_trial_reminder_sent) WHERE payment_status = 'TRIAL';
