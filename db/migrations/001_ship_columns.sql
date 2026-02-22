-- Migration 001: Add weapon_damage_total + variant_type columns to ships
-- These columns were previously added inline in schema.ts
-- This migration file serves as documentation and will be tracked by the migrations table.
-- Intentionally no-op for compatibility across SQL modes/protocols.
-- The actual conditional column creation remains in initializeSchema().
SELECT 1;
