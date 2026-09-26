-- Additive upgrade for existing installations; safe to apply repeatedly.
CREATE TABLE IF NOT EXISTS trip_records (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  revision TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS trip_records_updated_at ON trip_records(updated_at);
