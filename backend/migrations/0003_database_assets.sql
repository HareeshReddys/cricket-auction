CREATE TABLE assets (
  id TEXT PRIMARY KEY NOT NULL,
  mime TEXT NOT NULL,
  kind TEXT NOT NULL,
  tournament_id TEXT NOT NULL,
  size INTEGER NOT NULL
);
CREATE TABLE asset_chunks (
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (asset_id, position)
);
