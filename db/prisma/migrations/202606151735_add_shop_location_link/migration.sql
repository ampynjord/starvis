ALTER TABLE game.shops
  ADD COLUMN IF NOT EXISTS location_uuid CHAR(36);

CREATE INDEX IF NOT EXISTS shops_location_uuid_env_idx
  ON game.shops (location_uuid, env);
