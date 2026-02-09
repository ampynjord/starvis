-- ============================================================
-- STARAPI v1.0 - DATABASE SCHEMA
-- Corporate API for Star Citizen ship data
-- Sources: RSI Ship Matrix + P4K DataForge
-- ============================================================

-- ====================
-- MANUFACTURERS - Normalized manufacturer reference
-- ====================
CREATE TABLE IF NOT EXISTS manufacturers (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  country VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default manufacturers (all codes used in RSI Ship Matrix)
INSERT INTO manufacturers (code, name, description, country) VALUES
  ('AEGS', 'Aegis Dynamics', 'Military-focused manufacturer known for combat ships', 'UEE'),
  ('ANVL', 'Anvil Aerospace', 'Military and civilian ships, known for versatility', 'UEE'),
  ('AOPOA', 'Aopoa', 'Alien manufacturer (Xi''an) with unique aesthetics', 'Xi''an Empire'),
  ('ARGO', 'Argo Astronautics', 'Industrial and utility vehicles', 'UEE'),
  ('BANU', 'Banu', 'Alien manufacturer (Banu) - Merchantman', 'Banu Protectorate'),
  ('CNOU', 'Consolidated Outland', 'Innovative designs, focus on efficiency', 'UEE'),
  ('CRUS', 'Crusader Industries', 'Large ships and military vessels', 'UEE'),
  ('DRAK', 'Drake Interplanetary', 'Affordable, rugged ships', 'UEE'),
  ('ESPR', 'Esperia', 'Reproductions of alien ships (Vanduul)', 'UEE'),
  ('GAMA', 'Gatac Manufacture', 'Alien manufacturer (Tevarin) - Railen, Syulen', 'Tevarin'),
  ('GREY', 'Grey''s Market', 'Underground manufacturer - Black market vehicles', 'Underground'),
  ('GRIN', 'Greycat Industrial', 'Ground vehicles and industrial equipment', 'UEE'),
  ('KRIG', 'Kruger Intergalactic', 'Snub fighters and small craft', 'UEE'),
  ('MIRA', 'Mirai', 'Light fighters and racing ships', 'UEE'),
  ('MRAI', 'Mirai (alt)', 'Alternative code for Mirai', 'UEE'),
  ('MISC', 'Musashi Industrial & Starflight Concern', 'Versatile ships, Japanese-inspired', 'UEE'),
  ('ORIG', 'Origin Jumpworks', 'Luxury ships, premium quality', 'UEE'),
  ('RSI', 'Roberts Space Industries', 'Classic manufacturer, iconic ships', 'UEE'),
  ('TMBL', 'Tumbril Land Systems', 'Ground combat vehicles', 'UEE'),
  ('UNKN', 'Unknown', 'Unknown or Alien manufacturers', 'Unknown'),
  ('VNCL', 'Vanduul Clans', 'Alien warships (Vanduul)', 'Vanduul'),
  ('XNAA', 'Aopoa (alt)', 'Alternative code for Aopoa', 'Xi''an Empire')
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description);

-- ====================
-- SHIPS - Main table
-- ====================
CREATE TABLE IF NOT EXISTS ships (
  uuid CHAR(36) PRIMARY KEY COMMENT 'DataForge UUID or derived UUID for variants',
  
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
  
  -- P4K Data
  p4k_base_path TEXT,
  p4k_model_count INT DEFAULT 0,
  p4k_texture_count INT DEFAULT 0,
  
  -- Meta
  description TEXT,
  rsi_id INT,
  synced_at TIMESTAMP NULL,
  enriched_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_name (name),
  INDEX idx_manufacturer (manufacturer_code),
  INDEX idx_status (production_status),
  INDEX idx_flight_ready (is_flight_ready),
  INDEX idx_role (role),
  INDEX idx_size (size),
  INDEX idx_type (vehicle_type),
  INDEX idx_class_name (class_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- SHIP_SPECS - Technical specifications
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
  
  -- Maneuverability (deg/s)
  pitch_max DECIMAL(10, 2),
  yaw_max DECIMAL(10, 2),
  roll_max DECIMAL(10, 2),
  
  -- Acceleration (m/s²)
  acceleration_main DECIMAL(10, 4),
  acceleration_retro DECIMAL(10, 4),
  acceleration_vtol DECIMAL(10, 4),
  acceleration_maneuvering DECIMAL(10, 4),
  
  -- Health (from P4K DataForge)
  hull_hp INT,
  shield_hp INT,
  
  -- Fuel
  quantum_fuel DECIMAL(10, 2) COMMENT 'Quantum fuel capacity',
  hydrogen_fuel DECIMAL(10, 2) COMMENT 'Hydrogen fuel capacity',
  
  -- Weaponry (from P4K loadout XMLs)
  weapon_hardpoints TINYINT UNSIGNED COMMENT 'Number of weapon hardpoints',
  missile_racks TINYINT UNSIGNED COMMENT 'Number of missile racks',
  turrets TINYINT UNSIGNED COMMENT 'Number of turrets',
  
  FOREIGN KEY (ship_uuid) REFERENCES ships(uuid) ON DELETE CASCADE,
  INDEX idx_cargo (cargo_scu),
  INDEX idx_crew (max_crew)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
