-- Migration 001: Add weapon_damage_total + variant_type columns to ships
-- These columns were previously added inline in schema.ts
-- This migration file serves as documentation and will be tracked by the migrations table.

SET @schema_name = DATABASE();

SET @has_weapon_damage_total = (
	SELECT COUNT(*)
	FROM information_schema.COLUMNS
	WHERE TABLE_SCHEMA = @schema_name
		AND TABLE_NAME = 'ships'
		AND COLUMN_NAME = 'weapon_damage_total'
);
SET @sql = IF(
	@has_weapon_damage_total = 0,
	"ALTER TABLE ships ADD COLUMN weapon_damage_total DECIMAL(10,2) COMMENT 'Sum of all default weapon DPS (WeaponGun)' AFTER missile_damage_total",
	'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_variant_type = (
	SELECT COUNT(*)
	FROM information_schema.COLUMNS
	WHERE TABLE_SCHEMA = @schema_name
		AND TABLE_NAME = 'ships'
		AND COLUMN_NAME = 'variant_type'
);
SET @sql = IF(
	@has_variant_type = 0,
	"ALTER TABLE ships ADD COLUMN variant_type VARCHAR(20) COMMENT 'Non-playable variant tag' AFTER weapon_damage_total",
	'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
