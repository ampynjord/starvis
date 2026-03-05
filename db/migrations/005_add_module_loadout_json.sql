-- Migration 005: add loadout_json column to ship_modules
-- Stores the serialized LoadoutPortEntry[] for each module variant
-- so the frontend can display tier-correct sub-components (racks, missiles, etc.)

ALTER TABLE ship_modules
  ADD COLUMN loadout_json JSON DEFAULT NULL
    COMMENT 'Serialised LoadoutPortEntry[] for this module variant (racks and loaded weapons)';
