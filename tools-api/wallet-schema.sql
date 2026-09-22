-- The wallet's records about itself: bindings from a page's card name to a
-- saved account, opportunity resolutions, per-currency valuations and points
-- goals. One typed, encrypted record per row through the generic record
-- store; the validator is chrome-sidebar/src/wallet-data.js. Additive: the
-- rewards wallet, card records and catalogues are untouched.
CREATE TABLE IF NOT EXISTS wallet_records (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  revision TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
