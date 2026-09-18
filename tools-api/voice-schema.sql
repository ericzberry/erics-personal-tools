-- Eric's writing voice, learned from his own sent mail.
--
-- One row, because one person has one voice — or rather one set of them, which
-- the profile names. `value` is the same AES-GCM envelope the AI connections
-- and the Drive account use. It holds the finished profile and, while a study
-- is running, the state that lets it carry on: the accounts already read, and
-- the samples not yet folded into one. Message text is never stored beyond
-- that pending batch, and the whole row is deleted when the voice is forgotten.
CREATE TABLE IF NOT EXISTS voice_profiles (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
