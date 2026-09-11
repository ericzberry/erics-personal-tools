-- Google Drive access for the Taxes capability.
--
-- One account row, because one person files into one tax folder. `value` is the
-- same AES-GCM envelope the AI connections use, so the refresh token is never
-- readable from a D1 export on its own.
CREATE TABLE IF NOT EXISTS drive_accounts (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Short-lived, single-use tickets. `auth` is the OAuth state that stands in for
-- a bearer token on Google's redirect; `upload` is a resolved destination, so a
-- fund or firm name never has to travel in an upload URL. Both are deleted when
-- they are used and swept after fifteen minutes.
CREATE TABLE IF NOT EXISTS drive_tickets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS drive_tickets_created_at ON drive_tickets (created_at);
