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

-- A direct investment in a fund, a company or an SPV. This is the one holding
-- that does not reduce to an asset-class line, because the question it answers
-- is not "how much is in private equity" but "what did I commit to Acme
-- Ventures III, how much of it have they called, and how much has come back".
-- None of that survives being folded into a class total, so the investment
-- keeps its own identity: a name, the vehicle it is, the vehicle its paperwork
-- claims it is, and the class its value counts under.
--
-- The name is the only text here and is encrypted exactly like a portfolio's.
-- `portfolio` stays a readable column because deleting a portfolio has to be
-- able to find what it held.
CREATE TABLE IF NOT EXISTS finance_holdings (
  id INTEGER PRIMARY KEY,
  portfolio INTEGER NOT NULL REFERENCES finance_portfolios(id),
  value TEXT NOT NULL,
  revision TEXT NOT NULL
);

-- One capital account statement: four integers and the date they were struck.
-- Contributions and distributions are inception-to-date rather than per period,
-- so the newest row answers on its own and a quarter that never arrived cannot
-- corrupt a running total.
--
-- The primary key is the idempotency rule, as it is for a figure: one statement
-- per investment and date, so a change queued offline and replayed by the
-- Worker replaces its own row instead of duplicating it.
CREATE TABLE IF NOT EXISTS finance_capital (
  holding INTEGER NOT NULL REFERENCES finance_holdings(id),
  as_of INTEGER NOT NULL,
  cents INTEGER NOT NULL,
  contributed INTEGER NOT NULL,
  distributed INTEGER NOT NULL,
  commitment INTEGER NOT NULL,
  PRIMARY KEY (holding, as_of)
) WITHOUT ROWID;
