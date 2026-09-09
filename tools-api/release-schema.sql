CREATE TABLE IF NOT EXISTS app_releases (
  app TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  published_at TEXT NOT NULL
);
