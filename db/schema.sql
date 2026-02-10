-- ============================================================
-- STARAPI v1.0 - DATABASE SCHEMA
-- Last updated: February 10, 2026
-- 
-- Tables:
--   ship_matrix    → Raw data from RSI Ship Matrix API (external, 246 ships)
--   manufacturers  → All manufacturers from DataForge (ships + components)
--   ships          → Ships extracted from P4K/DataForge (game data only)
--   components     → All SCItem components from DataForge
--   ships_loadouts → Default loadout per ship (ports + equipped components)
-- ============================================================

-- ====================
-- SHIP_MATRIX - Raw RSI Ship Matrix data (246 ships, no game data)
-- ====================
CREATE TABLE IF NOT EXISTS ship_matrix (
  id INT PRIMARY KEY COMMENT 'RSI ship ID',
  name VARCHAR(255) NOT NULL,
  chassis_id INT,
  
  -- Manufacturer info (from RSI)
  manufacturer_id INT,
  manufacturer_code VARCHAR(10),
  manufacturer_name VARCHAR(100),
  
  -- Ship characteristics
  focus VARCHAR(255) COMMENT 'e.g. Starter / Pathfinder',
  type VARCHAR(50) COMMENT 'multi, combat, transport, etc.',
  description TEXT,
  production_status VARCHAR(50) COMMENT 'flight-ready, in-concept, in-production',
  production_note TEXT,
  size VARCHAR(20) COMMENT 'small, medium, large, capital',
  url VARCHAR(500) COMMENT 'RSI pledge page URL',
  
  -- Dimensions & specs (from RSI, not game data)
  length DECIMAL(10,2),
  beam DECIMAL(10,2),
  height DECIMAL(10,2),
  mass INT,
  cargocapacity INT,
  min_crew INT DEFAULT 1,
  max_crew INT DEFAULT 1,
  scm_speed INT,
  afterburner_speed INT,
  pitch_max DECIMAL(10,2),
  yaw_max DECIMAL(10,2),
  roll_max DECIMAL(10,2),
  xaxis_acceleration DECIMAL(10,4),
  yaxis_acceleration DECIMAL(10,4),
  zaxis_acceleration DECIMAL(10,4),
  
  -- Media
  media_source_url TEXT COMMENT 'Main image source URL',
  media_store_small TEXT COMMENT 'Store thumbnail URL',
  media_store_large TEXT COMMENT 'Store large image URL',
  
  -- Compiled hardpoints summary (JSON from RSI)
  compiled JSON COMMENT 'Full RSI compiled hardpoints (RSIAvionic, RSIModular, RSIPropulsion, RSIThruster, RSIWeapon)',
  
  -- Timestamps
  time_modified VARCHAR(100) COMMENT 'RSI relative time string',
  time_modified_unfiltered DATETIME COMMENT 'Exact last modified time',
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_name (name),
  INDEX idx_manufacturer_code (manufacturer_code),
  INDEX idx_production_status (production_status),
  INDEX idx_chassis_id (chassis_id),
  INDEX idx_size (size),
  INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- MANUFACTURERS - From DataForge game data (component + ship manufacturers)
-- ====================
CREATE TABLE IF NOT EXISTS manufacturers (
  code VARCHAR(10) PRIMARY KEY COMMENT 'e.g. AEGS, ANVL, RSI',
  name VARCHAR(100) NOT NULL,
  description TEXT,
  known_for VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- SHIPS - From P4K/DataForge (game data only)
-- ====================
CREATE TABLE IF NOT EXISTS ships (
  uuid CHAR(36) PRIMARY KEY COMMENT 'DataForge entity UUID',
  class_name VARCHAR(255) NOT NULL COMMENT 'e.g. AEGS_Gladius, RSI_Aurora',
  
  -- Ship identity
  name VARCHAR(255) COMMENT 'Display name from DataForge',
  manufacturer_code VARCHAR(10),
  
  -- Vehicle params (from VehicleComponentParams)
  role VARCHAR(100),
  career VARCHAR(100),
  dog_fight_enabled BOOLEAN DEFAULT TRUE,
  crew_size INT DEFAULT 1,
  vehicle_definition VARCHAR(255),
  
  -- Dimensions (from vehicle XML bounding box)
  size_x DECIMAL(10,2) COMMENT 'Width in meters',
  size_y DECIMAL(10,2) COMMENT 'Length in meters',
  size_z DECIMAL(10,2) COMMENT 'Height in meters',
  
  -- Mass (from vehicle XML)
  mass DECIMAL(15,2) COMMENT 'Total mass in kg',
  
  -- Flight (from IFCS / flight controller)
  scm_speed INT COMMENT 'Standard Combat Maneuvering speed',
  max_speed INT,
  
  -- Hull
  total_hp INT COMMENT 'Total hull hit points',
  
  -- Fuel (computed from fuel tank components)
  hydrogen_fuel_capacity DECIMAL(10,2),
  quantum_fuel_capacity DECIMAL(10,2),
  
  -- Shield summary
  shield_hp INT,
  
  -- Insurance
  insurance_claim_time DECIMAL(10,2) COMMENT 'Base wait time in minutes',
  insurance_expedite_cost DECIMAL(10,2),
  
  -- Full game data (erkul-compatible nested JSON)
  game_data JSON COMMENT 'Complete extracted game data',
  
  -- Ship Matrix link
  ship_matrix_id INT COMMENT 'FK to ship_matrix.id for cross-reference',
  
  extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_class_name (class_name),
  INDEX idx_name (name),
  INDEX idx_manufacturer (manufacturer_code),
  INDEX idx_ship_matrix (ship_matrix_id),
  CONSTRAINT fk_ship_manufacturer FOREIGN KEY (manufacturer_code) 
    REFERENCES manufacturers(code) ON DELETE SET NULL,
  CONSTRAINT fk_ship_matrix FOREIGN KEY (ship_matrix_id) 
    REFERENCES ship_matrix(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- COMPONENTS - All SCItem components from DataForge
-- ====================
CREATE TABLE IF NOT EXISTS components (
  uuid CHAR(36) PRIMARY KEY,
  class_name VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL COMMENT 'WeaponGun, Shield, PowerPlant, Cooler, etc.',
  sub_type VARCHAR(100),
  size TINYINT UNSIGNED,
  grade VARCHAR(10),
  manufacturer_code VARCHAR(10),
  
  -- Base stats
  mass DECIMAL(10,2),
  hp INT,
  
  -- Power
  power_draw DECIMAL(10,2),
  power_base DECIMAL(10,2),
  power_output DECIMAL(10,2),
  
  -- Thermal
  heat_generation DECIMAL(10,2),
  cooling_rate DECIMAL(10,2),
  
  -- Signatures
  em_signature DECIMAL(10,2),
  ir_signature DECIMAL(10,2),
  
  -- Weapon stats
  weapon_damage DECIMAL(10,4),
  weapon_damage_type VARCHAR(50),
  weapon_fire_rate DECIMAL(10,4),
  weapon_range DECIMAL(10,2),
  weapon_speed DECIMAL(10,2),
  weapon_ammo_count INT,
  weapon_pellets_per_shot TINYINT UNSIGNED DEFAULT 1,
  weapon_burst_size TINYINT UNSIGNED,
  weapon_alpha_damage DECIMAL(10,4),
  weapon_dps DECIMAL(10,4),
  
  -- Shield stats
  shield_hp DECIMAL(15,2),
  shield_regen DECIMAL(10,4),
  shield_regen_delay DECIMAL(10,2),
  shield_hardening DECIMAL(10,4),
  shield_faces TINYINT UNSIGNED,
  
  -- Quantum drive stats
  qd_speed DECIMAL(15,2),
  qd_spool_time DECIMAL(10,2),
  qd_cooldown DECIMAL(10,2),
  qd_fuel_rate DECIMAL(10,6),
  qd_range DECIMAL(15,2),
  qd_stage1_accel DECIMAL(15,2),
  qd_stage2_accel DECIMAL(15,2),
  
  -- Missile stats
  missile_damage DECIMAL(10,2),
  missile_signal_type VARCHAR(20),
  missile_lock_time DECIMAL(10,2),
  missile_speed DECIMAL(10,2),
  missile_range DECIMAL(10,2),
  missile_lock_range DECIMAL(10,2),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_type (type),
  INDEX idx_sub_type (sub_type),
  INDEX idx_size (size),
  INDEX idx_grade (grade),
  INDEX idx_manufacturer (manufacturer_code),
  INDEX idx_class_name (class_name),
  INDEX idx_type_size (type, size)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- SHIPS_LOADOUTS - Default loadout per ship (from DataForge entity loadout)
-- Each row = one port on a ship with its default equipped component
-- ====================
CREATE TABLE IF NOT EXISTS ships_loadouts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ship_uuid CHAR(36) NOT NULL COMMENT 'FK to ships.uuid',
  
  -- Port info
  port_name VARCHAR(100) NOT NULL COMMENT 'e.g. hardpoint_weapon_gun_left',
  port_display_name VARCHAR(100),
  port_min_size TINYINT UNSIGNED,
  port_max_size TINYINT UNSIGNED,
  port_editable BOOLEAN DEFAULT TRUE,
  
  -- Equipped component
  component_class_name VARCHAR(255) COMMENT 'DataForge className of equipped item',
  component_uuid CHAR(36) COMMENT 'FK to components.uuid if resolved',
  
  -- Classification
  port_type VARCHAR(50) COMMENT 'WeaponGun, Shield, PowerPlant, Cooler, Thruster, etc.',
  
  -- Hierarchy (sub-ports on turrets, missile racks, etc.)
  parent_id INT COMMENT 'FK to ship_loadouts.id for nested ports',
  
  INDEX idx_ship (ship_uuid),
  INDEX idx_port_type (port_type),
  INDEX idx_component (component_uuid),
  INDEX idx_parent (parent_id),
  CONSTRAINT fk_loadout_ship FOREIGN KEY (ship_uuid) REFERENCES ships(uuid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
