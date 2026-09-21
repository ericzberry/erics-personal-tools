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

-- A figure is five numbers and nothing else: which portfolio, which asset class
-- (the codes in chrome-sidebar/src/finance-data.js), which firm it was read at,
-- the date as YYYYMMDD, and the amount in whole cents. No names, no account
-- types spelled out, no JSON history blob. WITHOUT ROWID stores the row inside
-- its own key, so a year of weekly figures across six classes and three
-- portfolios is a few tens of kilobytes rather than megabytes of repeated
-- English.
--
-- The primary key is the idempotency rule: one amount per portfolio, class,
-- firm and date, so a change queued offline and replayed by the Worker replaces
-- its own figure instead of duplicating it.
--
-- The firm is in that key because leaving it out lost money. A figure is filed
-- under whose money it is, and one family holds accounts for the same trust at
-- two firms: both fold into that trust's portfolio, both are marketable
-- securities, both are read the same day. Under the old key those were one row,
-- so saving the second reading overwrote the first — silently, since the device
-- had just written the first and so held exactly the revision expected of it.
-- $9M of a $43M ledger disappeared that way. Two firms are two observations of
-- two different piles of money, and the key now says so; a figure nobody read
-- off a page — typed into the form, or folded out of a dropped file that named
-- no site — is firm 0.
--
-- A code rather than a name, for the reason a portfolio's name is encrypted:
-- this database is not allowed to say who banks where.
--
-- Changing this key on a populated database needs finance-marks-rebuild.sql,
-- which is deliberately not part of this file: a primary key cannot be altered
-- in place, and a DROP living here would empty the ledger on some later,
-- unrelated deployment.
CREATE TABLE IF NOT EXISTS finance_marks (
  portfolio INTEGER NOT NULL REFERENCES finance_portfolios(id),
  class INTEGER NOT NULL,
  firm INTEGER NOT NULL DEFAULT 0,
  as_of INTEGER NOT NULL,
  cents INTEGER NOT NULL,
  PRIMARY KEY (portfolio, class, firm, as_of)
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

-- One capital account statement: four integers, the date they were struck, and
-- a fifth integer only some statements state. Contributions and distributions
-- are inception-to-date rather than per period, so the newest row answers on
-- its own and a quarter that never arrived cannot corrupt a running total.
--
-- `unfunded` is what is left to call, and it is NULL unless the statement said
-- so, because the device derives it from the commitment and the contributions
-- and is right about it almost always. Almost: a fund can recall a
-- distribution, which puts it back on the unfunded commitment, and it can call
-- money outside the commitment altogether — an equalisation payment, an
-- organisational expense — which never came off it. A feeder into Vista Equity
-- Partners Fund VIII states 500K committed, 341K contributed and 167K left to
-- call, and commitment minus contributions is 159K: the 8K between them is
-- knowledge only the fund has. So where a statement states the figure, it is
-- kept and it wins.
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
  unfunded INTEGER,
  PRIMARY KEY (holding, as_of)
) WITHOUT ROWID;

-- A property. This is the other holding that does not reduce to an asset-class
-- line, and for the same reason the investment above does not: the question is
-- not "how much is in real estate" but "what is this house worth, what is still
-- owed on it, and what is therefore mine". Two houses folded into one Real
-- estate total lose both addresses, and a mortgage filed beside them as a
-- liability is attached to no particular house.
--
-- The address and the page its value is published on are the only text here,
-- encrypted exactly like a portfolio's name. `portfolio` stays a readable
-- column because deleting a portfolio has to be able to find what it held.
CREATE TABLE IF NOT EXISTS finance_properties (
  id INTEGER PRIMARY KEY,
  portfolio INTEGER NOT NULL REFERENCES finance_portfolios(id),
  value TEXT NOT NULL,
  revision TEXT NOT NULL
);

-- One dated reading of a property: what it is worth, what is still owed on it,
-- and which kind of figure the value is — a published Zestimate, an appraisal,
-- a sale price or the owner's own number.
--
-- The primary key is the idempotency rule, as it is everywhere else here: one
-- valuation per property and date, so a monthly refresh that runs twice, or a
-- change queued offline and replayed by the Worker, replaces its own row
-- instead of duplicating it.
CREATE TABLE IF NOT EXISTS finance_valuations (
  property INTEGER NOT NULL REFERENCES finance_properties(id),
  as_of INTEGER NOT NULL,
  cents INTEGER NOT NULL,
  debt INTEGER NOT NULL,
  source INTEGER NOT NULL,
  PRIMARY KEY (property, as_of)
) WITHOUT ROWID;
