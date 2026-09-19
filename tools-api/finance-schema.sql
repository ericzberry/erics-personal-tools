-- The ledger, relationally. Two tables and no repeated words.
--
-- A portfolio is where value is held: "Eric and Ariana Berry Estate", "IRA".
-- There are a handful of them, so the row carries its name, registration and
-- currency as one encrypted blob exactly like every other stored record here —
-- the name is the only text in the whole ledger and it is written once.
CREATE TABLE IF NOT EXISTS finance_portfolios (
  id INTEGER PRIMARY KEY,
  value TEXT NOT NULL,
  revision TEXT NOT NULL
);

-- A figure is four numbers and nothing else: which portfolio, which asset class
-- (the codes in chrome-sidebar/src/finance-data.js), the date as YYYYMMDD, and
-- the amount in whole cents. No names, no account types spelled out, no JSON
-- history blob. WITHOUT ROWID stores the row inside its own key, so a year of
-- weekly figures across six classes and three portfolios is a few tens of
-- kilobytes rather than megabytes of repeated English.
--
-- The primary key is the idempotency rule: one amount per portfolio, class and
-- date, so a change queued offline and replayed by the Worker replaces its own
-- figure instead of duplicating it.
CREATE TABLE IF NOT EXISTS finance_marks (
  portfolio INTEGER NOT NULL REFERENCES finance_portfolios(id),
  class INTEGER NOT NULL,
  as_of INTEGER NOT NULL,
  cents INTEGER NOT NULL,
  PRIMARY KEY (portfolio, class, as_of)
) WITHOUT ROWID;
