CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  revision TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
