-- ============================================================
-- STARAPI v1.0 - DATABASE SCHEMA
-- REST API for Star Citizen ships and manufacturers
-- Data Sources: RSI Ship Matrix + P4K DataForge enrichment
-- Focus: Ships and Manufacturers only (simplified version)
-- Last updated: February 9, 2026
-- ============================================================

-- ====================
-- MANUFACTURERS - Auto-populated from Ship Matrix API
-- Source: Ship Matrix API returns manufacturer.code, name, description
-- Created automatically during first ship sync
-- ====================
CREATE TABLE IF NOT EXISTS manufacturers (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  country VARCHAR(50) DEFAULT NULL COMMENT 'Not provided by API - can be added manually',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert fallback manufacturer for ships without manufacturer data
INSERT INTO manufacturers (code, name, description, country) VALUES
  ('UNKN', 'Unknown', 'Fallback for ships without manufacturer information', NULL)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- ====================
-- SHIPS - Main table (imported from RSI Ship Matrix, enriched from P4K)
-- ====================
CREATE TABLE IF NOT EXISTS ships (
  uuid CHAR(36) PRIMARY KEY COMMENT 'DataForge UUID or temp UUID (ffffffff-*)',
  
  -- Identification
  name VARCHAR(255) NOT NULL,
  manufacturer_code VARCHAR(10) NOT NULL,
  class_name VARCHAR(255) COMMENT 'DataForge className (ANVL_Hornet, ORIG_100i)',
  
  -- Classification
  role VARCHAR(100) COMMENT 'Primary role (Fighter, Cargo, Exploration)',
  size VARCHAR(50) COMMENT 'Ship size (Snub, Small, Medium, Large, Capital)',
  vehicle_type ENUM('spaceship', 'ground_vehicle', 'powersuit', 'snub') DEFAULT 'spaceship',
  
  -- Status
  production_status VARCHAR(50) COMMENT 'flight-ready, in-concept, in-production',
  is_flight_ready BOOLEAN GENERATED ALWAYS AS (production_status = 'flight-ready') STORED,
  
  -- Media
  thumbnail_url TEXT,
  store_url TEXT,
  
  -- P4K Data (enriched from game files)
  p4k_base_path TEXT,
  p4k_model_count INT DEFAULT 0,
  p4k_texture_count INT DEFAULT 0,
  
  -- Meta
  description TEXT,
  rsi_id INT,
  synced_at TIMESTAMP NULL COMMENT 'Last sync from RSI Ship Matrix',
  enriched_at TIMESTAMP NULL COMMENT 'Last P4K enrichment',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX idx_name (name),
  INDEX idx_manufacturer (manufacturer_code),
  INDEX idx_status (production_status),
  INDEX idx_flight_ready (is_flight_ready),
  INDEX idx_role (role),
  INDEX idx_size (size),
  INDEX idx_type (vehicle_type),
  INDEX idx_class_name (class_name),
  INDEX idx_manufacturer_status (manufacturer_code, production_status),
  INDEX idx_size_role (size, role),
  
  -- Foreign key
  CONSTRAINT fk_ship_manufacturer FOREIGN KEY (manufacturer_code) 
    REFERENCES manufacturers(code) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- SHIP_SPECS - Technical specifications (from RSI Ship Matrix)
-- ====================
CREATE TABLE IF NOT EXISTS ship_specs (
  ship_uuid CHAR(36) PRIMARY KEY,
  
  -- Dimensions (meters)
  length DECIMAL(10, 2),
  beam DECIMAL(10, 2),
  height DECIMAL(10, 2),
  
  -- Mass & Cargo
  mass DECIMAL(15, 2) COMMENT 'kg',
  cargo_scu DECIMAL(10, 2) COMMENT 'Standard Cargo Units',
  
  -- Crew
  min_crew TINYINT UNSIGNED DEFAULT 1,
  max_crew TINYINT UNSIGNED DEFAULT 1,
  
  -- Speed (m/s)
  scm_speed DECIMAL(10, 2),
  max_speed DECIMAL(10, 2),
  afterburner_speed DECIMAL(10, 2) COMMENT 'Afterburner/boost forward speed from P4K',
  
  -- Maneuverability (deg/s)
  pitch_max DECIMAL(10, 2),
  yaw_max DECIMAL(10, 2),
  roll_max DECIMAL(10, 2),
  
  -- Acceleration (m/s²)
  acceleration_main DECIMAL(10, 4),
  acceleration_retro DECIMAL(10, 4),
  acceleration_vtol DECIMAL(10, 4),
  acceleration_maneuvering DECIMAL(10, 4),
  
  -- Health
  hull_hp INT,
  shield_hp INT,
  
  -- Fuel
  quantum_fuel DECIMAL(10, 2) COMMENT 'Quantum fuel capacity',
  hydrogen_fuel DECIMAL(10, 2) COMMENT 'Hydrogen fuel capacity',
  
  -- Weaponry
  weapon_hardpoints TINYINT UNSIGNED COMMENT 'Number of weapon hardpoints',
  missile_racks TINYINT UNSIGNED COMMENT 'Number of missile racks',
  turrets TINYINT UNSIGNED COMMENT 'Number of turrets',
  
  -- P4K Advanced Stats  
  actual_mass DECIMAL(15, 2) COMMENT 'Actual mass from P4K (kg)',
  em_signature DECIMAL(10, 2) COMMENT 'EM signature (electromagnetic)',
  ir_signature DECIMAL(10, 2) COMMENT 'IR signature (thermal)',
  cs_signature DECIMAL(10, 2) COMMENT 'CS signature (cross-section radar)',
  shield_faces TINYINT UNSIGNED COMMENT 'Number of shield faces',
  radar_range DECIMAL(10, 2) COMMENT 'Radar detection range (m)',
  
  -- Foreign key & indexes
  CONSTRAINT fk_spec_ship FOREIGN KEY (ship_uuid) 
    REFERENCES ships(uuid) ON DELETE CASCADE,
  INDEX idx_cargo_spec (cargo_scu),
  INDEX idx_crew_spec (max_crew)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
