-- Migration 002: Ensure ship stat columns exist (idempotent recovery)
-- This migration re-applies the columns from migration 001 in case they were
-- not added (e.g. the prod DB had migration 001 pre-seeded without the columns
-- actually being created). ER_DUP_FIELDNAME is swallowed by the migration
-- runner so this is safe to run on DBs that already have the columns.

ALTER TABLE ships ADD COLUMN size_x DECIMAL(10,2) DEFAULT NULL COMMENT 'Width (m) from P4K bbox';
ALTER TABLE ships ADD COLUMN size_y DECIMAL(10,2) DEFAULT NULL COMMENT 'Length (m) from P4K bbox';
ALTER TABLE ships ADD COLUMN size_z DECIMAL(10,2) DEFAULT NULL COMMENT 'Height (m) from P4K bbox';
ALTER TABLE ships ADD COLUMN armor_hp DECIMAL(12,2) DEFAULT NULL COMMENT 'Armor plate HP';
ALTER TABLE ships ADD COLUMN armor_phys_resist DECIMAL(8,6) DEFAULT NULL COMMENT 'Armor physical damage multiplier';
ALTER TABLE ships ADD COLUMN armor_energy_resist DECIMAL(8,6) DEFAULT NULL COMMENT 'Armor energy damage multiplier';
ALTER TABLE ships ADD COLUMN fuse_penetration DECIMAL(6,4) DEFAULT NULL COMMENT 'Fuse penetration damage multiplier';
ALTER TABLE ships ADD COLUMN component_penetration DECIMAL(6,4) DEFAULT NULL COMMENT 'Component penetration damage multiplier';
ALTER TABLE ships ADD COLUMN boost_ramp_up DECIMAL(6,2) DEFAULT NULL COMMENT 'Afterburner ramp-up time (s)';
ALTER TABLE ships ADD COLUMN boost_ramp_down DECIMAL(6,2) DEFAULT NULL COMMENT 'Afterburner ramp-down time (s)';

-- Populate from game_data JSON (no-op if already populated)
UPDATE ships
SET
  armor_hp               = JSON_EXTRACT(game_data, '$.armor.data.health.hp'),
  armor_phys_resist      = JSON_EXTRACT(game_data, '$.armor.data.health.damageResistanceMultiplier.physical'),
  armor_energy_resist    = JSON_EXTRACT(game_data, '$.armor.data.health.damageResistanceMultiplier.energy'),
  fuse_penetration       = JSON_EXTRACT(game_data, '$.vehicle.fusePenetrationDamageMultiplier'),
  component_penetration  = JSON_EXTRACT(game_data, '$.vehicle.componentPenetrationDamageMultiplier'),
  boost_ramp_up          = JSON_EXTRACT(game_data, '$.ifcs.afterburner.afterburnerRampUpTime'),
  boost_ramp_down        = JSON_EXTRACT(game_data, '$.ifcs.afterburner.afterburnerRampDownTime')
WHERE game_data IS NOT NULL AND armor_hp IS NULL;
