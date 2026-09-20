-- What the birthday sweep of the owner's Google Calendar has already settled.
--
-- One row, because one person has one calendar connection. `value` is the same
-- AES-GCM envelope the AI connections, the Drive account and the writing voice
-- use. It holds when the sweep last ran, what it found, and the id of every
-- calendar event it has already dealt with — which is what makes a birthday
-- deleted by hand stay deleted rather than being written again next month.
--
-- The birthdays themselves are ordinary rows in `reminder_records`; nothing
-- here duplicates them.
CREATE TABLE IF NOT EXISTS calendar_scans (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
