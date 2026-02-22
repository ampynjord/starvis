-- Migration 001: Add weapon_damage_total + variant_type columns to ships
-- These columns were previously added inline in schema.ts
-- This migration file serves as documentation and will be tracked by the migrations table.

ALTER TABLE ships ADD COLUMN IF NOT EXISTS weapon_damage_total DECIMAL(10,2) COMMENT 'Sum of all default weapon DPS (WeaponGun)' AFTER missile_damage_total;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS variant_type VARCHAR(20) COMMENT 'Non-playable variant tag' AFTER weapon_damage_total;
