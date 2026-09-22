-- Run once against a database created before a dated figure could say which
-- import wrote it. `finance-schema.sql` carries the columns and the table for a
-- fresh one; CREATE TABLE IF NOT EXISTS cannot add a column to a table that is
-- already there, and SQLite has no ADD COLUMN IF NOT EXISTS, so running this
-- twice fails at the first ALTER with "duplicate column name: import_id" and
-- has changed nothing.
--
-- Additive and nullable on purpose: every row written before this is NULL,
-- which is exactly what it is — a figure nobody traced. Nothing is rewritten,
-- and code from before this change reads these tables unchanged, because it
-- names its columns rather than selecting all of them.
CREATE TABLE IF NOT EXISTS finance_imports (
  id INTEGER PRIMARY KEY,
  kind INTEGER NOT NULL,
  firm INTEGER NOT NULL DEFAULT 0,
  print TEXT NOT NULL DEFAULT '',
  value TEXT NOT NULL
);
ALTER TABLE finance_marks ADD COLUMN import_id INTEGER;
ALTER TABLE finance_capital ADD COLUMN import_id INTEGER;
ALTER TABLE finance_valuations ADD COLUMN import_id INTEGER;
ALTER TABLE finance_flows ADD COLUMN import_id INTEGER;
