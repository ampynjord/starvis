-- Migration 007: Rename ships_loadouts → ship_loadouts, drop redundant columns
--
-- Changes:
--   • ships_loadouts → ship_loadouts   (naming consistency with ship_modules, ship_paints)
--     NOTE: the rename itself is handled in-code (schema.ts) because RENAME TABLE
--           has no IF EXISTS clause in MySQL; this file handles only the column cleanups.
--
--   • shops.parent_location  → dropped (redundant with planet_moon)
--   • shop_inventory.item_uuid → dropped (column was never populated by the extractor)

-- Drop redundant parent_location from shops (replaced by planet_moon column)
ALTER TABLE shops
  DROP COLUMN IF EXISTS parent_location;

-- Drop vestigial item_uuid from shop_inventory
ALTER TABLE shop_inventory
  DROP FOREIGN KEY IF EXISTS fk_inventory_item;
ALTER TABLE shop_inventory
  DROP INDEX IF EXISTS idx_item;
ALTER TABLE shop_inventory
  DROP COLUMN IF EXISTS item_uuid;

-- Add planet_moon index if not already present (improves filtered shop queries)
ALTER TABLE shops
  ADD INDEX IF NOT EXISTS idx_planet_moon (planet_moon);

-- Add location_id column if not yet added by migration 006
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS location_id INT NULL COMMENT 'FK to locations.id';
ALTER TABLE shops
  ADD INDEX IF NOT EXISTS idx_location_id (location_id);
