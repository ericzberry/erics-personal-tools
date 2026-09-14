-- Additive upgrade: existing tables and records remain untouched; safe to rerun.
CREATE TABLE IF NOT EXISTS subscription_records (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  revision TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
