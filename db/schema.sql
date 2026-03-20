-- ============================================================
-- STARVIS — DATABASE SCHEMA
-- Source de vérité : api/prisma/schema.prisma (Prisma db push)
-- Ce fichier est exécuté au premier démarrage Docker (init.sh)
-- puis Prisma synchronise les éventuels écarts via db push.
-- ============================================================

-- ── ship_matrix (source: RSI Ship Matrix API) ───────────────
CREATE TABLE IF NOT EXISTS ship_matrix (
  id                    INT            PRIMARY KEY,
  name                  VARCHAR(255)   NOT NULL,
  chassis_id            INT            NULL,
  manufacturer_code     VARCHAR(10)    NULL,
  manufacturer_name     VARCHAR(100)   NULL,
  focus                 VARCHAR(255)   NULL,
  type                  VARCHAR(50)    NULL,
  description           TEXT           NULL,
  production_status     VARCHAR(50)    NULL,
  production_note       TEXT           NULL,
  size                  VARCHAR(20)    NULL,
  url                   VARCHAR(500)   NULL,
  length                DECIMAL(10,2)  NULL,
  beam                  DECIMAL(10,2)  NULL,
  height                DECIMAL(10,2)  NULL,
  mass                  INT            NULL,
  cargocapacity         INT            NULL,
  min_crew              INT            NOT NULL DEFAULT 1,
  max_crew              INT            NOT NULL DEFAULT 1,
  scm_speed             INT            NULL,
  afterburner_speed     INT            NULL,
  pitch_max             DECIMAL(10,2)  NULL,
  yaw_max               DECIMAL(10,2)  NULL,
  roll_max              DECIMAL(10,2)  NULL,
  xaxis_acceleration    DECIMAL(10,4)  NULL,
  yaxis_acceleration    DECIMAL(10,4)  NULL,
  zaxis_acceleration    DECIMAL(10,4)  NULL,
  media_source_url      TEXT           NULL,
  media_store_small     TEXT           NULL,
  media_store_large     TEXT           NULL,
  compiled              JSON           NULL,
  synced_at             TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_name              (name),
  INDEX idx_manufacturer_code (manufacturer_code),
  INDEX idx_production_status (production_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── manufacturers ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manufacturers (
  code        VARCHAR(10)  PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT         NULL,
  known_for   VARCHAR(255) NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── ships (source: DataForge P4K extraction) ─────────────────
CREATE TABLE IF NOT EXISTS ships (
  uuid           CHAR(36)      NOT NULL PRIMARY KEY,
  game_env       VARCHAR(10)   NOT NULL DEFAULT 'live',
  class_name     VARCHAR(255)  NOT NULL,
  name           VARCHAR(255)  NULL,
  manufacturer_code VARCHAR(10) NULL,

  -- Rôle
  role              VARCHAR(100)  NULL,
  career            VARCHAR(100)  NULL,
  crew_size         INT           NOT NULL DEFAULT 1,
  vehicle_category  VARCHAR(20)   NOT NULL DEFAULT 'ship',
  variant_type      VARCHAR(20)   NULL,
  short_name        VARCHAR(255)  NULL,

  -- Dimensions
  size_x   DECIMAL(10,2)  NULL,
  size_y   DECIMAL(10,2)  NULL,
  size_z   DECIMAL(10,2)  NULL,
  mass     DECIMAL(15,2)  NULL,

  -- Vol
  scm_speed            INT           NULL,
  max_speed            INT           NULL,
  boost_speed_forward  INT           NULL,
  boost_speed_backward INT           NULL,
  pitch_max            DECIMAL(8,2)  NULL,
  yaw_max              DECIMAL(8,2)  NULL,
  roll_max             DECIMAL(8,2)  NULL,
  boost_ramp_up        DECIMAL(8,2)  NULL,
  boost_ramp_down      DECIMAL(8,2)  NULL,

  -- Structure
  total_hp               INT            NULL,
  hydrogen_fuel_capacity DECIMAL(10,2)  NULL,
  quantum_fuel_capacity  DECIMAL(10,2)  NULL,
  cargo_capacity         DECIMAL(10,2)  NULL,
  shield_hp              INT            NULL,

  -- Armure & signatures
  armor_physical        DECIMAL(10,6)  NULL,
  armor_energy          DECIMAL(10,6)  NULL,
  armor_distortion      DECIMAL(10,6)  NULL,
  armor_thermal         DECIMAL(10,6)  NULL,
  armor_biochemical     DECIMAL(10,6)  NULL,
  armor_stun            DECIMAL(10,6)  NULL,
  armor_hp              DECIMAL(10,2)  NULL,
  armor_phys_resist     DECIMAL(10,6)  NULL,
  armor_energy_resist   DECIMAL(10,6)  NULL,
  armor_signal_ir       DECIMAL(10,6)  NULL,
  armor_signal_em       DECIMAL(10,6)  NULL,
  armor_signal_cs       DECIMAL(10,6)  NULL,
  fuse_penetration      DECIMAL(10,4)  NULL,
  component_penetration DECIMAL(10,4)  NULL,

  -- Section transversale
  cross_section_x DECIMAL(10,2)  NULL,
  cross_section_y DECIMAL(10,2)  NULL,
  cross_section_z DECIMAL(10,2)  NULL,

  -- Combat (calculé)
  missile_damage_total DECIMAL(10,2) NULL,
  weapon_damage_total  DECIMAL(10,2) NULL,

  -- Assurance
  insurance_claim_time    DECIMAL(10,2) NULL,
  insurance_expedite_cost DECIMAL(10,2) NULL,

  -- Données brutes & liens
  game_data      JSON   NULL,
  ship_matrix_id INT    NULL,
  extracted_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_manufacturer (manufacturer_code),
  INDEX idx_ship_matrix  (ship_matrix_id),
  INDEX idx_game_env     (game_env),
  CONSTRAINT fk_ship_manufacturer FOREIGN KEY (manufacturer_code) REFERENCES manufacturers(code) ON DELETE SET NULL,
  CONSTRAINT fk_ship_matrix       FOREIGN KEY (ship_matrix_id)    REFERENCES ship_matrix(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── components (source: DataForge) ───────────────────────────
CREATE TABLE IF NOT EXISTS components (
  uuid              CHAR(36)      NOT NULL PRIMARY KEY,
  game_env          VARCHAR(10)   NOT NULL DEFAULT 'live',
  class_name        VARCHAR(255)  NOT NULL,
  name              VARCHAR(255)  NOT NULL,
  type              VARCHAR(50)   NOT NULL,
  sub_type          VARCHAR(100)  NULL,
  size              TINYINT UNSIGNED NULL,
  grade             VARCHAR(10)   NULL,
  manufacturer_code VARCHAR(10)   NULL,
  mass              DECIMAL(10,2) NULL,
  hp                INT           NULL,

  -- Énergie / Thermique / Signatures
  power_draw      DECIMAL(10,2) NULL,
  power_base      DECIMAL(10,2) NULL,
  power_output    DECIMAL(10,2) NULL,
  heat_generation DECIMAL(10,2) NULL,
  cooling_rate    DECIMAL(15,2) NULL,
  em_signature    DECIMAL(10,2) NULL,
  ir_signature    DECIMAL(10,2) NULL,

  -- Armes
  weapon_damage            DECIMAL(10,4) NULL,
  weapon_damage_type       VARCHAR(50)   NULL,
  weapon_fire_rate         DECIMAL(10,4) NULL,
  weapon_range             DECIMAL(10,2) NULL,
  weapon_speed             DECIMAL(10,2) NULL,
  weapon_ammo_count        INT           NULL,
  weapon_pellets_per_shot  TINYINT UNSIGNED NULL DEFAULT 1,
  weapon_burst_size        TINYINT UNSIGNED NULL,
  weapon_alpha_damage      DECIMAL(10,4) NULL,
  weapon_dps               DECIMAL(10,4) NULL,
  weapon_damage_physical   DECIMAL(10,4) NULL,
  weapon_damage_energy     DECIMAL(10,4) NULL,
  weapon_damage_distortion DECIMAL(10,4) NULL,
  weapon_damage_thermal    DECIMAL(10,4) NULL,
  weapon_damage_biochemical DECIMAL(10,4) NULL,
  weapon_damage_stun       DECIMAL(10,4) NULL,
  weapon_heat_per_shot     DECIMAL(10,5) NULL,
  weapon_burst_dps         DECIMAL(10,4) NULL,
  weapon_sustained_dps     DECIMAL(10,4) NULL,

  -- Bouclier
  shield_hp          DECIMAL(15,2) NULL,
  shield_regen       DECIMAL(10,4) NULL,
  shield_regen_delay DECIMAL(10,2) NULL,
  shield_hardening   DECIMAL(10,4) NULL,
  shield_faces       TINYINT UNSIGNED NULL,

  -- Quantum Drive
  qd_speed            DECIMAL(15,2) NULL,
  qd_spool_time       DECIMAL(10,2) NULL,
  qd_cooldown         DECIMAL(10,2) NULL,
  qd_fuel_rate        DECIMAL(10,6) NULL,
  qd_range            DECIMAL(15,2) NULL,
  qd_stage1_accel     DECIMAL(15,2) NULL,
  qd_stage2_accel     DECIMAL(15,2) NULL,
  qd_tuning_rate      DECIMAL(10,4) NULL,
  qd_alignment_rate   DECIMAL(10,4) NULL,
  qd_disconnect_range DECIMAL(15,2) NULL,

  -- Missiles
  missile_damage            DECIMAL(10,2) NULL,
  missile_signal_type       VARCHAR(20)   NULL,
  missile_lock_time         DECIMAL(10,2) NULL,
  missile_speed             DECIMAL(10,2) NULL,
  missile_range             DECIMAL(10,2) NULL,
  missile_lock_range        DECIMAL(10,2) NULL,
  missile_damage_physical   DECIMAL(10,2) NULL,
  missile_damage_energy     DECIMAL(10,2) NULL,
  missile_damage_distortion DECIMAL(10,2) NULL,

  -- Thruster / Radar
  thruster_max_thrust       DECIMAL(15,2) NULL,
  thruster_type             VARCHAR(50)   NULL,
  radar_range               DECIMAL(15,2) NULL,
  radar_detection_lifetime  DECIMAL(10,2) NULL,
  radar_tracking_signal     DECIMAL(10,4) NULL,

  -- Divers
  cm_ammo_count      INT           NULL,
  fuel_capacity      DECIMAL(10,2) NULL,
  fuel_intake_rate   DECIMAL(10,4) NULL,
  emp_damage         DECIMAL(10,2) NULL,
  emp_radius         DECIMAL(10,2) NULL,
  emp_charge_time    DECIMAL(10,2) NULL,
  emp_cooldown       DECIMAL(10,2) NULL,
  qig_jammer_range   DECIMAL(15,2) NULL,
  qig_snare_radius   DECIMAL(15,2) NULL,
  qig_charge_time    DECIMAL(10,2) NULL,
  qig_cooldown       DECIMAL(10,2) NULL,
  mining_speed       DECIMAL(10,4) NULL,
  mining_range       DECIMAL(10,2) NULL,
  mining_resistance  DECIMAL(10,4) NULL,
  mining_instability DECIMAL(10,4) NULL,
  tractor_max_force  DECIMAL(15,2) NULL,
  tractor_max_range  DECIMAL(10,2) NULL,
  salvage_speed      DECIMAL(10,4) NULL,
  salvage_radius     DECIMAL(10,2) NULL,
  gimbal_type        VARCHAR(20)   NULL,
  rack_count         TINYINT UNSIGNED NULL,
  rack_missile_size  TINYINT UNSIGNED NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_type        (type),
  INDEX idx_sub_type    (sub_type),
  INDEX idx_manufacturer (manufacturer_code),
  INDEX idx_game_env    (game_env)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── ship_loadouts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ship_loadouts (
  id                   INT           AUTO_INCREMENT PRIMARY KEY,
  ship_uuid            CHAR(36)      NOT NULL,
  game_env             VARCHAR(10)   NOT NULL DEFAULT 'live',
  port_name            VARCHAR(100)  NOT NULL,
  port_min_size        TINYINT UNSIGNED NULL,
  port_max_size        TINYINT UNSIGNED NULL,
  port_editable        BOOLEAN       NOT NULL DEFAULT TRUE,
  component_class_name VARCHAR(255)  NULL,
  component_uuid       CHAR(36)      NULL,
  port_type            VARCHAR(50)   NULL,
  parent_id            INT           NULL,

  INDEX idx_ship      (ship_uuid),
  INDEX idx_component (component_uuid),
  CONSTRAINT fk_loadout_ship FOREIGN KEY (ship_uuid) REFERENCES ships(uuid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── ship_modules ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ship_modules (
  id                 INT           AUTO_INCREMENT PRIMARY KEY,
  ship_uuid          CHAR(36)      NOT NULL,
  game_env           VARCHAR(10)   NOT NULL DEFAULT 'live',
  slot_name          VARCHAR(100)  NOT NULL,
  slot_display_name  VARCHAR(100)  NULL,
  slot_type          VARCHAR(20)   NULL,
  module_class_name  VARCHAR(255)  NOT NULL,
  module_name        VARCHAR(255)  NULL,
  module_tier        TINYINT UNSIGNED NULL,
  is_default         BOOLEAN       NOT NULL DEFAULT FALSE,
  loadout_json       JSON          NULL,

  UNIQUE KEY uq_ship_slot_module (ship_uuid, game_env, slot_name, module_class_name),
  INDEX idx_ship (ship_uuid),
  CONSTRAINT fk_module_ship FOREIGN KEY (ship_uuid) REFERENCES ships(uuid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── ship_paints ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ship_paints (
  id               INT           AUTO_INCREMENT PRIMARY KEY,
  ship_uuid        CHAR(36)      NOT NULL,
  game_env         VARCHAR(10)   NOT NULL DEFAULT 'live',
  paint_class_name VARCHAR(255)  NOT NULL,
  paint_name       VARCHAR(255)  NULL,
  paint_uuid       CHAR(36)      NULL,

  INDEX idx_ship (ship_uuid),
  CONSTRAINT fk_paint_ship FOREIGN KEY (ship_uuid) REFERENCES ships(uuid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── items (FPS weapons, armor, clothing…) ────────────────────
CREATE TABLE IF NOT EXISTS items (
  uuid              CHAR(36)      NOT NULL PRIMARY KEY,
  game_env          VARCHAR(10)   NOT NULL DEFAULT 'live',
  class_name        VARCHAR(255)  NOT NULL,
  name              VARCHAR(255)  NOT NULL,
  type              VARCHAR(50)   NOT NULL,
  sub_type          VARCHAR(100)  NULL,
  size              TINYINT UNSIGNED NULL,
  grade             VARCHAR(10)   NULL,
  manufacturer_code VARCHAR(10)   NULL,
  mass              DECIMAL(10,2) NULL,
  hp                INT           NULL,

  weapon_damage      DECIMAL(10,4) NULL,
  weapon_damage_type VARCHAR(50)   NULL,
  weapon_fire_rate   DECIMAL(10,4) NULL,
  weapon_range       DECIMAL(10,2) NULL,
  weapon_speed       DECIMAL(10,2) NULL,
  weapon_ammo_count  INT           NULL,
  weapon_dps         DECIMAL(10,4) NULL,

  armor_damage_reduction DECIMAL(10,4) NULL,
  armor_temp_min         DECIMAL(10,2) NULL,
  armor_temp_max         DECIMAL(10,2) NULL,

  data_json  JSON      NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_type     (type),
  INDEX idx_game_env (game_env)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── commodities ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commodities (
  uuid          CHAR(36)      NOT NULL PRIMARY KEY,
  game_env      VARCHAR(10)   NOT NULL DEFAULT 'live',
  class_name    VARCHAR(255)  NOT NULL,
  name          VARCHAR(255)  NOT NULL,
  type          VARCHAR(50)   NOT NULL,
  sub_type      VARCHAR(100)  NULL,
  symbol        VARCHAR(20)   NULL,
  occupancy_scu DECIMAL(10,4) NULL,
  data_json     JSON          NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_type     (type),
  INDEX idx_game_env (game_env)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── shops ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shops (
  id          INT           AUTO_INCREMENT PRIMARY KEY,
  game_env    VARCHAR(10)   NOT NULL DEFAULT 'live',
  name        VARCHAR(255)  NOT NULL,
  class_name  VARCHAR(255)  NOT NULL,
  location    VARCHAR(255)  NULL,
  `system`    VARCHAR(50)   NULL,
  planet_moon VARCHAR(100)  NULL,
  city        VARCHAR(100)  NULL,
  shop_type   VARCHAR(50)   NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_class_env (class_name, game_env),
  INDEX idx_game_env (game_env)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── shop_inventory ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_inventory (
  id                   INT           AUTO_INCREMENT PRIMARY KEY,
  shop_id              INT           NOT NULL,
  game_env             VARCHAR(10)   NOT NULL DEFAULT 'live',
  component_uuid       CHAR(36)      NULL,
  component_class_name VARCHAR(255)  NOT NULL,
  base_price           DECIMAL(12,2) NULL,
  rental_price_1d      DECIMAL(12,2) NULL,
  rental_price_3d      DECIMAL(12,2) NULL,
  rental_price_7d      DECIMAL(12,2) NULL,
  rental_price_30d     DECIMAL(12,2) NULL,
  created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_shop_component (shop_id, component_class_name),
  INDEX idx_shop      (shop_id),
  INDEX idx_component (component_uuid),
  CONSTRAINT fk_inventory_shop FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── mining_elements ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mining_elements (
  uuid                         VARCHAR(36)   NOT NULL PRIMARY KEY,
  game_env                     VARCHAR(10)   NOT NULL DEFAULT 'live',
  class_name                   VARCHAR(255)  NOT NULL,
  name                         VARCHAR(255)  NULL,
  commodity_uuid               VARCHAR(36)   NULL,
  instability                  DECIMAL(8,2)  NULL,
  resistance                   DECIMAL(6,4)  NULL,
  optimal_window_midpoint      DECIMAL(6,4)  NULL,
  optimal_window_midpoint_rand DECIMAL(6,4)  NULL,
  optimal_window_thinness      DECIMAL(6,4)  NULL,
  explosion_multiplier         DECIMAL(8,2)  NULL,
  cluster_factor               DECIMAL(6,4)  NULL,

  INDEX idx_game_env (game_env)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── mining_compositions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS mining_compositions (
  uuid                  VARCHAR(36)   NOT NULL PRIMARY KEY,
  game_env              VARCHAR(10)   NOT NULL DEFAULT 'live',
  class_name            VARCHAR(255)  NOT NULL,
  deposit_name          VARCHAR(255)  NULL,
  min_distinct_elements INT           NULL,

  INDEX idx_game_env (game_env)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── mining_composition_parts ─────────────────────────────────
CREATE TABLE IF NOT EXISTS mining_composition_parts (
  id               INT           AUTO_INCREMENT PRIMARY KEY,
  composition_uuid VARCHAR(36)   NOT NULL,
  element_uuid     VARCHAR(36)   NOT NULL,
  game_env         VARCHAR(10)   NOT NULL DEFAULT 'live',
  min_percentage   DECIMAL(6,2)  NULL,
  max_percentage   DECIMAL(6,2)  NULL,
  probability      DECIMAL(6,4)  NULL,
  curve_exponent   DECIMAL(6,4)  NULL,

  INDEX idx_composition (composition_uuid),
  INDEX idx_element     (element_uuid),
  CONSTRAINT fk_mcp_composition FOREIGN KEY (composition_uuid) REFERENCES mining_compositions(uuid) ON DELETE CASCADE,
  CONSTRAINT fk_mcp_element     FOREIGN KEY (element_uuid)     REFERENCES mining_elements(uuid)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── missions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS missions (
  uuid                CHAR(36)     NOT NULL PRIMARY KEY,
  class_name          VARCHAR(300) NOT NULL,
  title               VARCHAR(500) NULL,
  description         TEXT         NULL,
  mission_type        VARCHAR(100) NULL,
  can_be_shared       TINYINT(1)   NOT NULL DEFAULT 0,
  only_owner_complete TINYINT(1)   NOT NULL DEFAULT 0,
  is_legal            TINYINT(1)   NOT NULL DEFAULT 1,
  completion_time_s   INT          NULL,
  not_for_release     TINYINT(1)   NOT NULL DEFAULT 0,
  work_in_progress    TINYINT(1)   NOT NULL DEFAULT 0,
  game_env            VARCHAR(10)  NOT NULL DEFAULT 'live',

  INDEX idx_mission_type (mission_type),
  INDEX idx_game_env     (game_env)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── extraction_log ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS extraction_log (
  id                   INT           AUTO_INCREMENT PRIMARY KEY,
  extraction_hash      CHAR(64)      NOT NULL,
  game_version         VARCHAR(50)   NULL,
  game_env             VARCHAR(10)   NOT NULL DEFAULT 'live',
  ships_count          INT           NOT NULL DEFAULT 0,
  components_count     INT           NOT NULL DEFAULT 0,
  items_count          INT           NOT NULL DEFAULT 0,
  commodities_count    INT           NOT NULL DEFAULT 0,
  manufacturers_count  INT           NOT NULL DEFAULT 0,
  loadout_ports_count  INT           NOT NULL DEFAULT 0,
  shops_count          INT           NOT NULL DEFAULT 0,
  duration_ms          INT           NULL,
  status               ENUM('success','partial','failed') NOT NULL DEFAULT 'success',
  error_message        TEXT          NULL,
  extracted_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_hash         (extraction_hash),
  INDEX idx_game_env     (game_env)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── changelog ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS changelog (
  id            INT           AUTO_INCREMENT PRIMARY KEY,
  extraction_id INT           NOT NULL,
  entity_type   ENUM('ship','component','item','commodity','shop','module') NOT NULL,
  entity_uuid   VARCHAR(255)  NOT NULL,
  entity_name   VARCHAR(255)  NULL,
  change_type   ENUM('added','removed','modified') NOT NULL,
  field_name    VARCHAR(100)  NULL,
  old_value     TEXT          NULL,
  new_value     TEXT          NULL,
  game_version  VARCHAR(50)   NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_extraction   (extraction_id),
  INDEX idx_entity_type  (entity_type),
  INDEX idx_change_type  (change_type),
  INDEX idx_game_version (game_version),
  CONSTRAINT fk_changelog_extraction FOREIGN KEY (extraction_id) REFERENCES extraction_log(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
