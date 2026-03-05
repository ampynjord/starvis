-- Migration 003 — Add module_tier column to ship_modules
-- Apply on production: mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < 003_add_module_tier.sql
-- (or via SSH tunnel / docker exec)

ALTER TABLE ship_modules
  ADD COLUMN module_tier TINYINT UNSIGNED DEFAULT NULL
    COMMENT 'Tier number (1/2/3) for Apollo-style modules — NULL for others'
  AFTER module_uuid;
