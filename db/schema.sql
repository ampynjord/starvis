-- ============================================================
-- STARVIS v1.0 - DATABASE SCHEMA
-- Last updated: June 2025
-- 
-- Tables:
--   ship_matrix       → Raw data from RSI Ship Matrix API (external)
--   manufacturers     → All manufacturers from DataForge (ships + components)
--   ships             → Ships extracted from P4K/DataForge (game data only)
--   components        → All SCItem components from DataForge
--   ships_loadouts    → Default loadout per ship (ports + equipped components)
--   extraction_log    → Extraction version history
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
  boost_speed_forward INT COMMENT 'Afterburner forward speed',
  boost_speed_backward INT COMMENT 'Afterburner backward speed',
  pitch_max DECIMAL(8,2) COMMENT 'Max pitch rate (deg/s)',
  yaw_max DECIMAL(8,2) COMMENT 'Max yaw rate (deg/s)',
  roll_max DECIMAL(8,2) COMMENT 'Max roll rate (deg/s)',
  
  -- Hull
  total_hp INT COMMENT 'Total hull hit points',
  
  -- Fuel (computed from fuel tank components)
  hydrogen_fuel_capacity DECIMAL(10,2),
  quantum_fuel_capacity DECIMAL(10,2),
  
  -- Shield summary
  shield_hp INT,
  
  -- Armor damage multipliers (from SCItemVehicleArmorParams)
  armor_physical DECIMAL(10,6) COMMENT 'Physical damage multiplier',
  armor_energy DECIMAL(10,6) COMMENT 'Energy damage multiplier',
  armor_distortion DECIMAL(10,6) COMMENT 'Distortion damage multiplier',
  armor_thermal DECIMAL(10,6) COMMENT 'Thermal damage multiplier',
  armor_biochemical DECIMAL(10,6) COMMENT 'Biochemical damage multiplier',
  armor_stun DECIMAL(10,6) COMMENT 'Stun damage multiplier',
  armor_signal_ir DECIMAL(10,6) COMMENT 'IR signature multiplier',
  armor_signal_em DECIMAL(10,6) COMMENT 'EM signature multiplier',
  armor_signal_cs DECIMAL(10,6) COMMENT 'Cross-section signature multiplier',
  
  -- Cross section (bounding box projections in m²)
  cross_section_x DECIMAL(10,2) COMMENT 'Front profile area',
  cross_section_y DECIMAL(10,2) COMMENT 'Side profile area',
  cross_section_z DECIMAL(10,2) COMMENT 'Top profile area',
  
  -- Extra metadata (Erkul parity)
  short_name VARCHAR(255) COMMENT 'Short display name',
  description TEXT COMMENT 'In-game description',
  ship_grade VARCHAR(10) COMMENT 'Grade (A, B, C...)',
  cargo_capacity DECIMAL(10,2) COMMENT 'Total cargo SCU',
  missile_damage_total DECIMAL(10,2) COMMENT 'Sum of all default missile damage',
  weapon_damage_total DECIMAL(10,2) COMMENT 'Sum of all default weapon DPS (WeaponGun)',
  variant_type VARCHAR(20) COMMENT 'Non-playable variant tag: exec, collector, bis_edition, tutorial, enemy_ai, military, event, pirate, arena_ai, special',
  vehicle_category VARCHAR(20) DEFAULT 'ship' COMMENT 'ship, ground, gravlev — vehicle classification',
  
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
  INDEX idx_role (role),
  INDEX idx_career (career),
  INDEX idx_vehicle_category (vehicle_category),
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
  cooling_rate DECIMAL(15,2),
  
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
  weapon_damage_physical DECIMAL(10,4),
  weapon_damage_energy DECIMAL(10,4),
  weapon_damage_distortion DECIMAL(10,4),
  weapon_damage_thermal DECIMAL(10,4),
  weapon_damage_biochemical DECIMAL(10,4),
  weapon_damage_stun DECIMAL(10,4),
  weapon_heat_per_shot DECIMAL(10,5),
  weapon_burst_dps DECIMAL(10,4),
  weapon_sustained_dps DECIMAL(10,4),
  
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
  missile_damage_physical DECIMAL(10,2),
  missile_damage_energy DECIMAL(10,2),
  missile_damage_distortion DECIMAL(10,2),
  
  -- Thruster stats
  thruster_max_thrust DECIMAL(15,2) COMMENT 'Maximum thrust force (N)',
  thruster_type VARCHAR(50) COMMENT 'Main, Retro, Maneuvering, VTOL',
  
  -- Radar stats
  radar_range DECIMAL(15,2) COMMENT 'Detection range (m)',
  radar_detection_lifetime DECIMAL(10,2) COMMENT 'How long a detected signal persists (s)',
  radar_tracking_signal DECIMAL(10,4) COMMENT 'Tracking signal amplifier multiplier',
  
  -- Countermeasure stats
  cm_ammo_count INT COMMENT 'Countermeasure ammo count',
  
  -- Fuel tank stats
  fuel_capacity DECIMAL(10,2) COMMENT 'Fuel capacity (L or SCU)',
  
  -- Fuel intake stats
  fuel_intake_rate DECIMAL(10,4) COMMENT 'Fuel intake rate',
  
  -- EMP stats
  emp_damage DECIMAL(10,2) COMMENT 'EMP distortion damage',
  emp_radius DECIMAL(10,2) COMMENT 'EMP max effect radius (m)',
  emp_charge_time DECIMAL(10,2) COMMENT 'EMP charge duration (s)',
  emp_cooldown DECIMAL(10,2) COMMENT 'EMP cooldown time (s)',
  
  -- Quantum Interdiction Generator (QIG/QED) stats
  qig_jammer_range DECIMAL(15,2) COMMENT 'QIG jammer range (m)',
  qig_snare_radius DECIMAL(15,2) COMMENT 'QIG quantum snare radius (m)',
  qig_charge_time DECIMAL(10,2) COMMENT 'QIG charge time (s)',
  qig_cooldown DECIMAL(10,2) COMMENT 'QIG cooldown time (s)',
  
  -- Quantum Drive extended stats (spline jump)
  qd_tuning_rate DECIMAL(10,4) COMMENT 'QD spline jump tuning rate',
  qd_alignment_rate DECIMAL(10,4) COMMENT 'QD spline jump alignment rate',
  qd_disconnect_range DECIMAL(15,2) COMMENT 'QD disconnect range (m)',
  
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
  CONSTRAINT fk_loadout_ship FOREIGN KEY (ship_uuid) REFERENCES ships(uuid) ON DELETE CASCADE,
  CONSTRAINT fk_loadout_component FOREIGN KEY (component_uuid) REFERENCES components(uuid) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- SHIP_MODULES - Modular compartments for ships like Retaliator, Apollo, Caterpillar
-- ====================
CREATE TABLE IF NOT EXISTS ship_modules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ship_uuid CHAR(36) NOT NULL COMMENT 'FK to ships.uuid — parent ship',
  slot_name VARCHAR(100) NOT NULL COMMENT 'e.g. module_front, module_rear',
  slot_display_name VARCHAR(100) COMMENT 'Human-readable slot name',
  module_class_name VARCHAR(255) NOT NULL COMMENT 'DataForge className of the module entity',
  module_name VARCHAR(255) COMMENT 'Display name of the module',
  module_uuid CHAR(36) COMMENT 'DataForge UUID of the module',
  is_default BOOLEAN DEFAULT FALSE COMMENT 'Whether this is the default module for this slot',
  
  INDEX idx_ship (ship_uuid),
  INDEX idx_module_class (module_class_name),
  CONSTRAINT fk_module_ship FOREIGN KEY (ship_uuid) REFERENCES ships(uuid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- SHIP_PAINTS - Available paints/liveries per ship
-- ====================
CREATE TABLE IF NOT EXISTS ship_paints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ship_uuid CHAR(36) NOT NULL COMMENT 'FK to ships.uuid — parent ship',
  paint_class_name VARCHAR(255) NOT NULL COMMENT 'DataForge className of paint entity',
  paint_name VARCHAR(255) COMMENT 'Display name of the paint/livery',
  paint_uuid CHAR(36) COMMENT 'DataForge entity UUID of the paint',
  
  INDEX idx_ship (ship_uuid),
  INDEX idx_paint_class (paint_class_name),
  CONSTRAINT fk_paint_ship FOREIGN KEY (ship_uuid) REFERENCES ships(uuid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- EXTRACTION_LOG - Version history for game data extractions
-- (must come before changelog which references it via FK)
-- ====================
CREATE TABLE IF NOT EXISTS extraction_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  extraction_hash CHAR(64) NOT NULL COMMENT 'SHA-256 of p4k metadata',
  game_version VARCHAR(50) COMMENT 'Detected game version string',
  ships_count INT DEFAULT 0,
  components_count INT DEFAULT 0,
  manufacturers_count INT DEFAULT 0,
  loadout_ports_count INT DEFAULT 0,
  duration_ms INT COMMENT 'Extraction duration in ms',
  status ENUM('success', 'partial', 'failed') DEFAULT 'success',
  error_message TEXT,
  extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_hash (extraction_hash),
  INDEX idx_extracted_at (extracted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- CHANGELOG - Track changes between game data extractions
-- ====================
CREATE TABLE IF NOT EXISTS changelog (
  id INT AUTO_INCREMENT PRIMARY KEY,
  extraction_id INT NOT NULL COMMENT 'FK to extraction_log.id',
  entity_type ENUM('ship', 'component', 'shop', 'module') NOT NULL,
  entity_uuid VARCHAR(255) NOT NULL COMMENT 'UUID or identifier of changed entity',
  entity_name VARCHAR(255) COMMENT 'Name for display',
  change_type ENUM('added', 'removed', 'modified') NOT NULL,
  field_name VARCHAR(100) COMMENT 'Which field changed (for modifications)',
  old_value TEXT COMMENT 'Previous value (JSON for complex)',
  new_value TEXT COMMENT 'New value (JSON for complex)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_extraction (extraction_id),
  INDEX idx_entity_type (entity_type),
  INDEX idx_change_type (change_type),
  INDEX idx_created (created_at),
  CONSTRAINT fk_changelog_extraction FOREIGN KEY (extraction_id) REFERENCES extraction_log(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- SHOPS - In-game shops / vendor locations
-- ====================
CREATE TABLE IF NOT EXISTS shops (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255) COMMENT 'e.g. Port Olisar, Lorville',
  parent_location VARCHAR(255) COMMENT 'e.g. Crusader, Hurston',
  shop_type VARCHAR(50) COMMENT 'Weapon, Ship, Component, etc.',
  class_name VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_location (location),
  INDEX idx_type (shop_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- SHOP_INVENTORY - Items available for purchase / rental in shops
-- ====================
CREATE TABLE IF NOT EXISTS shop_inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shop_id INT NOT NULL,
  component_uuid CHAR(36) COMMENT 'FK to components.uuid if resolved',
  component_class_name VARCHAR(255) NOT NULL,
  base_price DECIMAL(12,2),
  rental_price_1d DECIMAL(12,2),
  rental_price_3d DECIMAL(12,2),
  rental_price_7d DECIMAL(12,2),
  rental_price_30d DECIMAL(12,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_shop (shop_id),
  INDEX idx_component (component_uuid),
  INDEX idx_class_name (component_class_name),
  UNIQUE KEY uk_shop_component (shop_id, component_class_name),
  CONSTRAINT fk_inventory_shop FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_component FOREIGN KEY (component_uuid) REFERENCES components(uuid) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
