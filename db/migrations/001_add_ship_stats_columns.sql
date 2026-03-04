-- Migration 001: Add ship dimension and combat stats columns
-- Adds size_x/y/z, armor_hp, resistances, penetration and boost ramp columns

ALTER TABLE ships
  ADD COLUMN IF NOT EXISTS size_x DECIMAL(10,2) DEFAULT NULL COMMENT 'Width (m) from P4K bbox',
  ADD COLUMN IF NOT EXISTS size_y DECIMAL(10,2) DEFAULT NULL COMMENT 'Length (m) from P4K bbox',
  ADD COLUMN IF NOT EXISTS size_z DECIMAL(10,2) DEFAULT NULL COMMENT 'Height (m) from P4K bbox',
  ADD COLUMN IF NOT EXISTS armor_hp DECIMAL(12,2) DEFAULT NULL COMMENT 'Armor plate HP (game_data.armor.data.health.hp)',
  ADD COLUMN IF NOT EXISTS armor_phys_resist DECIMAL(8,6) DEFAULT NULL COMMENT 'Armor physical damage multiplier (<1 = reduction)',
  ADD COLUMN IF NOT EXISTS armor_energy_resist DECIMAL(8,6) DEFAULT NULL COMMENT 'Armor energy damage multiplier (>1 = increase)',
  ADD COLUMN IF NOT EXISTS fuse_penetration DECIMAL(6,4) DEFAULT NULL COMMENT 'Fuse penetration damage multiplier (game_data.vehicle.fusePenetrationDamageMultiplier)',
  ADD COLUMN IF NOT EXISTS component_penetration DECIMAL(6,4) DEFAULT NULL COMMENT 'Component penetration damage multiplier',
  ADD COLUMN IF NOT EXISTS boost_ramp_up DECIMAL(6,2) DEFAULT NULL COMMENT 'Afterburner ramp-up time (s)',
  ADD COLUMN IF NOT EXISTS boost_ramp_down DECIMAL(6,2) DEFAULT NULL COMMENT 'Afterburner ramp-down time (s)';

-- Populate size_x/y/z from Ship Matrix where P4K bbox is missing
UPDATE ships s
  JOIN ship_matrix sm ON s.ship_matrix_id = sm.id
SET
  s.size_x = sm.beam,
  s.size_y = sm.length,
  s.size_z = sm.height
WHERE (s.size_y IS NULL OR s.size_y = 0)
  AND sm.length IS NOT NULL
  AND sm.length > 0;

-- Populate armor/penetration/boost columns from existing game_data JSON
UPDATE ships
SET
  armor_hp               = JSON_EXTRACT(game_data, '$.armor.data.health.hp'),
  armor_phys_resist      = JSON_EXTRACT(game_data, '$.armor.data.health.damageResistanceMultiplier.physical'),
  armor_energy_resist    = JSON_EXTRACT(game_data, '$.armor.data.health.damageResistanceMultiplier.energy'),
  fuse_penetration       = JSON_EXTRACT(game_data, '$.vehicle.fusePenetrationDamageMultiplier'),
  component_penetration  = JSON_EXTRACT(game_data, '$.vehicle.componentPenetrationDamageMultiplier'),
  boost_ramp_up          = JSON_EXTRACT(game_data, '$.ifcs.afterburner.afterburnerRampUpTime'),
  boost_ramp_down        = JSON_EXTRACT(game_data, '$.ifcs.afterburner.afterburnerRampDownTime')
WHERE game_data IS NOT NULL;
