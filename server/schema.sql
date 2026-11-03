-- 체커드 서버 데이터베이스 구조 (Cloudflare D1)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  rec_salt TEXT NOT NULL,
  rec_hash TEXT NOT NULL,
  profile TEXT,
  profile_updated INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  fail_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS records (
  user_id INTEGER NOT NULL,
  track TEXT NOT NULL,
  laps INTEGER NOT NULL,
  time REAL NOT NULL,
  lap_times TEXT NOT NULL,
  skin TEXT,
  ghost TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, track, laps)
);
CREATE INDEX IF NOT EXISTS idx_records_board ON records(track, laps, time);
