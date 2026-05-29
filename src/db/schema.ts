export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  video_uri TEXT NOT NULL,
  fps REAL NOT NULL,
  duration_ms INTEGER NOT NULL,
  tact_time_sec REAL NOT NULL DEFAULT 60,
  mode TEXT NOT NULL DEFAULT 'person',
  parent_session_id TEXT,
  hourly_rate_yen REAL,
  cycles_per_day INTEGER,
  working_days_per_year INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  cycle_number INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  start_time_ms INTEGER NOT NULL,
  end_time_ms INTEGER NOT NULL,
  category TEXT NOT NULL,
  waste_type TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_resources_session ON resources(session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_resource ON tasks(resource_id);

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT
);
`;
