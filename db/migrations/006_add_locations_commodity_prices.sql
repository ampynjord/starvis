-- Migration 006: Add locations hierarchy and commodity prices tables
-- Enables trade simulator (UEX-style) and "where to buy" enrichment

-- ── Locations hierarchy ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  type        ENUM('system','planet','moon','station','city','terminal') NOT NULL DEFAULT 'station',
  parent_id   INT NULL COMMENT 'Parent location (e.g. station → planet)',
  system_name VARCHAR(100) NULL COMMENT 'Denormalized star system for fast filter',
  orbit_name  VARCHAR(100) NULL COMMENT 'Planet / moon name',
  class_name  VARCHAR(255) NULL COMMENT 'In-game entity class name',
  is_available BOOLEAN DEFAULT TRUE COMMENT 'Currently accessible in-game',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_type    (type),
  INDEX idx_system  (system_name),
  INDEX idx_parent  (parent_id),
  INDEX idx_class   (class_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Commodity prices per terminal ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commodity_prices (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  commodity_uuid CHAR(36) NOT NULL,
  location_id   INT NULL COMMENT 'FK to locations.id if matched',
  location_name VARCHAR(255) NOT NULL COMMENT 'Denormalized name for display',
  system_name   VARCHAR(100) NULL,
  buy_price     DECIMAL(12,2) NULL COMMENT 'aUEC per SCU (NULL = cannot buy here)',
  sell_price    DECIMAL(12,2) NULL COMMENT 'aUEC per SCU (NULL = cannot sell here)',
  is_illegal    BOOLEAN DEFAULT FALSE,
  source        ENUM('game_files','crowdsourced') DEFAULT 'game_files',
  extracted_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_commodity (commodity_uuid),
  INDEX idx_location  (location_id),
  INDEX idx_system    (system_name),
  UNIQUE KEY uk_commodity_location (commodity_uuid, location_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Commodity availability view ───────────────────────────────────────────────
-- Link shops to locations (nullable, enriched progressively)
ALTER TABLE shops
  ADD COLUMN location_id INT NULL COMMENT 'FK to locations.id',
  ADD INDEX idx_location_id (location_id);

-- ── Ship ASOP prices per location ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ship_prices (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  ship_uuid     CHAR(36) NOT NULL,
  location_name VARCHAR(255) NOT NULL,
  system_name   VARCHAR(100) NULL,
  buy_price     BIGINT NULL COMMENT 'aUEC (NULL = not sold here)',
  rent_price_1d BIGINT NULL,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ship_location (ship_uuid, location_name),
  INDEX idx_ship   (ship_uuid),
  INDEX idx_system (system_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
