-- The last reading of the account's Cloudflare storage, and the threshold band
-- it was last reported at. One row, replaced in place. This is account
-- telemetry, not a record: nothing personal is in it, so it is not encrypted,
-- and no device queues edits to it. See tools-api/src/quota.js.
CREATE TABLE IF NOT EXISTS storage_usage (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
