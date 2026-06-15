ALTER TABLE game.locations
  ADD COLUMN IF NOT EXISTS starmap_match_method VARCHAR(30),
  ADD COLUMN IF NOT EXISTS starmap_match_score INTEGER,
  ADD COLUMN IF NOT EXISTS starmap_match_confidence VARCHAR(20);

CREATE INDEX IF NOT EXISTS locations_starmap_match_confidence_idx
  ON game.locations (starmap_match_confidence);

CREATE TABLE IF NOT EXISTS game.starmap_location_aliases (
  id SERIAL PRIMARY KEY,
  env VARCHAR(10),
  source VARCHAR(30) NOT NULL DEFAULT 'manual',
  game_uuid CHAR(36),
  game_class_name VARCHAR(255),
  game_name VARCHAR(255),
  game_type VARCHAR(50),
  system_code VARCHAR(20),
  rsi_starmap_location_id INTEGER NOT NULL,
  confidence VARCHAR(20) NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL
);

ALTER TABLE game.starmap_location_aliases
  ADD CONSTRAINT starmap_location_aliases_rsi_starmap_location_id_fkey
  FOREIGN KEY (rsi_starmap_location_id)
  REFERENCES rsi.starmap_locations(id)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS starmap_location_aliases_env_game_uuid_key
  ON game.starmap_location_aliases (env, game_uuid);

CREATE INDEX IF NOT EXISTS starmap_location_aliases_game_class_name_idx
  ON game.starmap_location_aliases (game_class_name);

CREATE INDEX IF NOT EXISTS starmap_location_aliases_game_name_system_code_idx
  ON game.starmap_location_aliases (game_name, system_code);

CREATE INDEX IF NOT EXISTS starmap_location_aliases_rsi_starmap_location_id_idx
  ON game.starmap_location_aliases (rsi_starmap_location_id);
