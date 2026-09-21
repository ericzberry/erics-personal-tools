-- What the quarterly backup last did: the Drive file it wrote and the quarter
-- that file stands for, the last restore and the safety backup taken before it,
-- and — while a quarter's backup keeps failing — how many days it has failed
-- and whether the owner has been told. One row, replaced in place.
--
-- It holds Drive file ids, dates and error messages and nothing personal, so it
-- is not encrypted. The backups themselves are in Google Drive; this row is
-- only the memory that keeps the daily trigger to one backup per quarter, and
-- losing it costs at most one extra backup. See tools-api/src/backup.js.
--
-- Additive: applying this file to a database made before it existed adds the
-- table empty and touches nothing else.
CREATE TABLE IF NOT EXISTS backup_state (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
