-- One row per AI action whose model the owner has chosen by hand. An action
-- with no row here is routed automatically by src/model-policy.js.
CREATE TABLE IF NOT EXISTS ai_task_models (
  task TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
