-- Migration 004 — Add slot_type column + unique constraint to ship_modules
-- Apply on production: mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < 004_add_module_slot_type.sql

ALTER TABLE ship_modules
  ADD COLUMN slot_type VARCHAR(20) DEFAULT NULL
    COMMENT 'front/rear (Retaliator) or left/right (Apollo)'
  AFTER slot_display_name;

-- Add unique constraint to allow ON DUPLICATE KEY UPDATE during re-extraction
ALTER TABLE ship_modules
  ADD UNIQUE KEY uq_ship_slot_module (ship_uuid, slot_name, module_class_name);
