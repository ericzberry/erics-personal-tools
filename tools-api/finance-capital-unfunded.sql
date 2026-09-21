-- Run once against a database created before a capital account could state
-- what is left to call. `finance-schema.sql` carries the column for a fresh
-- one, and CREATE TABLE IF NOT EXISTS cannot add it to a table that is already
-- there; SQLite has no ADD COLUMN IF NOT EXISTS, so running this twice fails
-- with "duplicate column name: unfunded" and has changed nothing.
--
-- Additive and nullable on purpose: every row written before this is NULL,
-- which is exactly what "the statement did not say, so work it out" means, and
-- the code that reads these rows was already deciding it that way.
ALTER TABLE finance_capital ADD COLUMN unfunded INTEGER;
