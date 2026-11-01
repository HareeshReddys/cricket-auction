CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL COLLATE NOCASE UNIQUE,password_hash TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','organizer')),created_at TEXT NOT NULL);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
CREATE INDEX session_expiry ON sessions(expires_at);
CREATE TABLE memberships(tournament_id TEXT NOT NULL REFERENCES tournaments(id),user_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(tournament_id,user_id));
CREATE TABLE invites(token_hash TEXT PRIMARY KEY,tournament_id TEXT NOT NULL REFERENCES tournaments(id),email TEXT NOT NULL COLLATE NOCASE,expires_at INTEGER NOT NULL,accepted_at INTEGER);
CREATE TABLE login_attempts(key TEXT PRIMARY KEY,failures INTEGER NOT NULL DEFAULT 0,window_start INTEGER NOT NULL);
CREATE TABLE sheet_sync(tournament_id TEXT PRIMARY KEY REFERENCES tournaments(id),spreadsheet_id TEXT,url TEXT,status TEXT NOT NULL DEFAULT 'pending',last_version INTEGER NOT NULL DEFAULT -1,last_error TEXT,updated_at TEXT);
CREATE TABLE sync_lock(id INTEGER PRIMARY KEY,token TEXT NOT NULL,expires_at INTEGER NOT NULL);
