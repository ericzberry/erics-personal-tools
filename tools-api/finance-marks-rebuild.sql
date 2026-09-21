-- One-time rebuild of finance_marks to key a figure by the firm it was read at.
--
-- Run once, by hand, against the deployed database. This is NOT part of
-- finance-schema.sql and must never be added to it: that file is applied
-- routinely and is `CREATE TABLE IF NOT EXISTS` throughout, so a DROP inside it
-- would empty the ledger on some later, unrelated deployment.
--
-- Why a rebuild rather than an ALTER: the old primary key was
-- (portfolio, class, as_of), and adding a column cannot change a primary key.
-- SQLite has no ALTER for one, and the table is WITHOUT ROWID, so the key is
-- the storage layout rather than an index beside it.
--
-- Why the rows are not carried over: a stored row cannot say which firm it came
-- from — that is the whole of the defect this fixes — so every existing figure
-- would have to land at firm 0, and each one is already the survivor of an
-- overwrite rather than a figure anybody can vouch for. The owner asked to
-- start from readings taken after the fix instead of migrating figures known to
-- be wrong. Nothing else in the ledger is touched: portfolios, investments,
-- capital accounts, properties and valuations keep their own keys, which never
-- had this problem, and a portfolio surviving is what the re-read figures land
-- back into.
DROP TABLE IF EXISTS finance_marks;

CREATE TABLE IF NOT EXISTS finance_marks (
  portfolio INTEGER NOT NULL REFERENCES finance_portfolios(id),
  class INTEGER NOT NULL,
  -- Where this figure was read: a code from the registry in
  -- chrome-sidebar/src/finance-data.js, and 0 for a figure nobody read off a
  -- page — one typed into the form, or folded out of a dropped file that named
  -- no site. A number rather than a name, for the reason a portfolio's name is
  -- encrypted: this database is not allowed to say who banks where.
  firm INTEGER NOT NULL DEFAULT 0,
  as_of INTEGER NOT NULL,
  cents INTEGER NOT NULL,
  PRIMARY KEY (portfolio, class, firm, as_of)
) WITHOUT ROWID;
