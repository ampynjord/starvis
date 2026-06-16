-- Add scraped ARK Starmap 3D assets (textures, models, skybox) to system-level locations
ALTER TABLE rsi.starmap_locations ADD COLUMN IF NOT EXISTS assets JSONB;
