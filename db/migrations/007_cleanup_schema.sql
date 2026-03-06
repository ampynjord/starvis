-- Migration 007: Rename ships_loadouts → ship_loadouts, drop redundant columns
--
-- Changes:
--   • ships_loadouts → ship_loadouts   (naming consistency with ship_modules, ship_paints)
--     NOTE: the rename itself is handled in-code (schema.ts) because RENAME TABLE
--           has no IF EXISTS clause in MySQL; this file handles only the column cleanups.
--
--   • shops.parent_location  → dropped (redundant with planet_moon)
--   • shop_inventory.item_uuid → dropped (column was never populated by the extractor)
--
-- NOTE: MySQL 8.0 does not support DROP COLUMN IF EXISTS / ADD COLUMN IF NOT EXISTS.
-- The migration runner in schema.ts already silently ignores:
--   ER_CANT_DROP_FIELD_OR_KEY → column/key doesn't exist (DROP on fresh install)
--   ER_DUP_FIELDNAME          → column already exists (ADD on already-migrated install)
--   ER_DUP_KEYNAME            → index already exists  (ADD INDEX on already-migrated install)

-- Drop redundant parent_location from shops (replaced by planet_moon)
ALTER TABLE shops
  DROP COLUMN parent_location;

-- Drop vestigial item_uuid from shop_inventory (never populated by extractor)
ALTER TABLE shop_inventory
  DROP FOREIGN KEY fk_inventory_item;
ALTER TABLE shop_inventory
  DROP INDEX idx_item;
ALTER TABLE shop_inventory
  DROP COLUMN item_uuid;

-- Add planet_moon index (improves filtered shop queries)
ALTER TABLE shops
  ADD INDEX idx_planet_moon (planet_moon);

-- Add location_id column (from migration 006 if not already present)
ALTER TABLE shops
  ADD COLUMN location_id INT NULL COMMENT 'FK to locations.id';
ALTER TABLE shops
  ADD INDEX idx_location_id (location_id);
