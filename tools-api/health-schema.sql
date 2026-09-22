-- Health: one row per sealed object — a record, a relative, or a prior
-- revision — indistinguishable from one another here. `value` is the Worker's
-- envelope around the device's envelope; `revision` is what a write must name
-- to replace the row, and `updated_at` is operational, not the event's date.
--
-- Additive: applying this file to a database made before it existed adds the
-- table empty and touches nothing else. Apply it before deploying the code
-- that serves /v1/health.
CREATE TABLE IF NOT EXISTS health_records (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  revision TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
