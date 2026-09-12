CREATE TABLE IF NOT EXISTS property_records (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  revision TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
