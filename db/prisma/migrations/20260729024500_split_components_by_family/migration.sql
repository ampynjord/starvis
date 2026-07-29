-- Éclatement de `game.components` par famille.
--
-- La table portait 124 colonnes dont 19 renseignées : 30 toujours nulles, 67
-- nulles pour plus de neuf lignes sur dix. Un bouclier traînait cent cinq
-- colonnes vides, et une famille ne pouvait pas gagner un champ sans que les
-- autres le subissent.
--
-- **Des vues, pas encore des tables.** Le découpage est dérivé de la donnée, et
-- il doit être éprouvé avant que le stockage ne bascule : une vue se corrige,
-- une migration de stockage se défait mal. L'extracteur continue d'écrire la
-- table large ; la bascule suit, une fois la décomposition confirmée à l'usage.
--
-- Les colonnes jamais renseignées figurent dans leur famille — `cooling_rate`
-- chez les refroidisseurs, `power_output` chez les centrales. Les retirer
-- ferait disparaître un manque connu de l'extraction plutôt que de le montrer.

CREATE OR REPLACE VIEW "game"."component_weapons" AS
SELECT "uuid", "env", "class_name", "name", "normalized_name", "canonical_component_key", "type", "sub_type", "size", "grade", "manufacturer_code", "hp", "is_bespoke", "game_component_category", "p4k_path", "created_at", "updated_at", "weapon_damage", "weapon_damage_type", "weapon_fire_rate", "weapon_range", "weapon_speed", "weapon_ammo_count", "weapon_alpha_damage", "weapon_dps", "weapon_burst_dps", "weapon_sustained_dps", "weapon_damage_physical", "weapon_pellets_per_shot", "weapon_burst_size", "weapon_charge_time", "weapon_damage_energy", "weapon_damage_distortion", "weapon_damage_biochemical", "weapon_damage_stun", "weapon_damage_thermal", "weapon_beam_capacity", "weapon_beam_regen_cooldown"
FROM "game"."components"
WHERE "type" IN ('WeaponGun', 'RocketPod')
  AND NOT (
    "class_name" ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
    OR "name" ~* '(^temps|stemps|temporary|template|placeholder)'
  );

CREATE OR REPLACE VIEW "game"."component_shields" AS
SELECT "uuid", "env", "class_name", "name", "normalized_name", "canonical_component_key", "type", "sub_type", "size", "grade", "manufacturer_code", "hp", "is_bespoke", "game_component_category", "p4k_path", "created_at", "updated_at", "shield_hp", "shield_regen", "shield_regen_delay", "shield_hardening", "shield_faces"
FROM "game"."components"
WHERE "type" IN ('Shield')
  AND NOT (
    "class_name" ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
    OR "name" ~* '(^temps|stemps|temporary|template|placeholder)'
  );

CREATE OR REPLACE VIEW "game"."component_quantum_drives" AS
SELECT "uuid", "env", "class_name", "name", "normalized_name", "canonical_component_key", "type", "sub_type", "size", "grade", "manufacturer_code", "hp", "is_bespoke", "game_component_category", "p4k_path", "created_at", "updated_at", "qd_speed", "qd_spool_time", "qd_cooldown", "qd_fuel_rate", "qd_stage1_accel", "qd_stage2_accel", "qd_tuning_rate", "qd_alignment_rate", "qd_disconnect_range", "qd_range", "qd_calibration_delay", "qd_calibration_max_angle"
FROM "game"."components"
WHERE "type" IN ('QuantumDrive')
  AND NOT (
    "class_name" ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
    OR "name" ~* '(^temps|stemps|temporary|template|placeholder)'
  );

CREATE OR REPLACE VIEW "game"."component_missiles" AS
SELECT "uuid", "env", "class_name", "name", "normalized_name", "canonical_component_key", "type", "sub_type", "size", "grade", "manufacturer_code", "hp", "is_bespoke", "game_component_category", "p4k_path", "created_at", "updated_at", "missile_damage", "missile_signal_type", "missile_lock_time", "missile_speed", "missile_range", "missile_lock_range", "missile_damage_physical", "missile_damage_energy", "missile_damage_distortion", "missile_damage_biochemical", "missile_damage_stun", "missile_damage_thermal"
FROM "game"."components"
WHERE "type" IN ('Missile')
  AND NOT (
    "class_name" ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
    OR "name" ~* '(^temps|stemps|temporary|template|placeholder)'
  );

CREATE OR REPLACE VIEW "game"."component_thrusters" AS
SELECT "uuid", "env", "class_name", "name", "normalized_name", "canonical_component_key", "type", "sub_type", "size", "grade", "manufacturer_code", "hp", "is_bespoke", "game_component_category", "p4k_path", "created_at", "updated_at", "thruster_max_thrust", "thruster_type"
FROM "game"."components"
WHERE "type" IN ('Thruster')
  AND NOT (
    "class_name" ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
    OR "name" ~* '(^temps|stemps|temporary|template|placeholder)'
  );

CREATE OR REPLACE VIEW "game"."component_radars" AS
SELECT "uuid", "env", "class_name", "name", "normalized_name", "canonical_component_key", "type", "sub_type", "size", "grade", "manufacturer_code", "hp", "is_bespoke", "game_component_category", "p4k_path", "created_at", "updated_at", "radar_range", "radar_detection_lifetime", "radar_tracking_signal"
FROM "game"."components"
WHERE "type" IN ('Radar')
  AND NOT (
    "class_name" ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
    OR "name" ~* '(^temps|stemps|temporary|template|placeholder)'
  );

CREATE OR REPLACE VIEW "game"."component_countermeasures" AS
SELECT "uuid", "env", "class_name", "name", "normalized_name", "canonical_component_key", "type", "sub_type", "size", "grade", "manufacturer_code", "hp", "is_bespoke", "game_component_category", "p4k_path", "created_at", "updated_at", "cm_ammo_count"
FROM "game"."components"
WHERE "type" IN ('Countermeasure')
  AND NOT (
    "class_name" ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
    OR "name" ~* '(^temps|stemps|temporary|template|placeholder)'
  );

CREATE OR REPLACE VIEW "game"."component_fuel_tanks" AS
SELECT "uuid", "env", "class_name", "name", "normalized_name", "canonical_component_key", "type", "sub_type", "size", "grade", "manufacturer_code", "hp", "is_bespoke", "game_component_category", "p4k_path", "created_at", "updated_at", "fuel_capacity"
FROM "game"."components"
WHERE "type" IN ('FuelTank')
  AND NOT (
    "class_name" ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
    OR "name" ~* '(^temps|stemps|temporary|template|placeholder)'
  );

CREATE OR REPLACE VIEW "game"."component_fuel_intakes" AS
SELECT "uuid", "env", "class_name", "name", "normalized_name", "canonical_component_key", "type", "sub_type", "size", "grade", "manufacturer_code", "hp", "is_bespoke", "game_component_category", "p4k_path", "created_at", "updated_at", "fuel_intake_rate"
FROM "game"."components"
WHERE "type" IN ('FuelIntake')
  AND NOT (
    "class_name" ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
    OR "name" ~* '(^temps|stemps|temporary|template|placeholder)'
  );

CREATE OR REPLACE VIEW "game"."component_emps" AS
SELECT "uuid", "env", "class_name", "name", "normalized_name", "canonical_component_key", "type", "sub_type", "size", "grade", "manufacturer_code", "hp", "is_bespoke", "game_component_category", "p4k_path", "created_at", "updated_at", "emp_damage", "emp_radius", "emp_charge_time", "emp_cooldown"
FROM "game"."components"
WHERE "type" IN ('EMP')
  AND NOT (
    "class_name" ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
    OR "name" ~* '(^temps|stemps|temporary|template|placeholder)'
  );

CREATE OR REPLACE VIEW "game"."component_interdictions" AS
SELECT "uuid", "env", "class_name", "name", "normalized_name", "canonical_component_key", "type", "sub_type", "size", "grade", "manufacturer_code", "hp", "is_bespoke", "game_component_category", "p4k_path", "created_at", "updated_at", "qig_jammer_range", "qig_snare_radius", "qig_charge_time", "qig_cooldown"
FROM "game"."components"
WHERE "type" IN ('QuantumInterdictionGenerator')
  AND NOT (
    "class_name" ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
    OR "name" ~* '(^temps|stemps|temporary|template|placeholder)'
  );

CREATE OR REPLACE VIEW "game"."component_mining_lasers" AS
SELECT "uuid", "env", "class_name", "name", "normalized_name", "canonical_component_key", "type", "sub_type", "size", "grade", "manufacturer_code", "hp", "is_bespoke", "game_component_category", "p4k_path", "created_at", "updated_at", "mining_speed", "mining_range", "mining_resistance"
FROM "game"."components"
WHERE "type" IN ('MiningLaser')
  AND NOT (
    "class_name" ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
    OR "name" ~* '(^temps|stemps|temporary|template|placeholder)'
  );

CREATE OR REPLACE VIEW "game"."component_salvage_heads" AS
SELECT "uuid", "env", "class_name", "name", "normalized_name", "canonical_component_key", "type", "sub_type", "size", "grade", "manufacturer_code", "hp", "is_bespoke", "game_component_category", "p4k_path", "created_at", "updated_at", "salvage_speed", "salvage_radius", "salvage_range"
FROM "game"."components"
WHERE "type" IN ('SalvageHead')
  AND NOT (
    "class_name" ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
    OR "name" ~* '(^temps|stemps|temporary|template|placeholder)'
  );

CREATE OR REPLACE VIEW "game"."component_coolers" AS
SELECT "uuid", "env", "class_name", "name", "normalized_name", "canonical_component_key", "type", "sub_type", "size", "grade", "manufacturer_code", "hp", "is_bespoke", "game_component_category", "p4k_path", "created_at", "updated_at", "cooling_rate", "heat_generation"
FROM "game"."components"
WHERE "type" IN ('Cooler')
  AND NOT (
    "class_name" ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
    OR "name" ~* '(^temps|stemps|temporary|template|placeholder)'
  );

CREATE OR REPLACE VIEW "game"."component_power_plants" AS
SELECT "uuid", "env", "class_name", "name", "normalized_name", "canonical_component_key", "type", "sub_type", "size", "grade", "manufacturer_code", "hp", "is_bespoke", "game_component_category", "p4k_path", "created_at", "updated_at", "power_output", "power_base", "power_draw"
FROM "game"."components"
WHERE "type" IN ('PowerPlant')
  AND NOT (
    "class_name" ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
    OR "name" ~* '(^temps|stemps|temporary|template|placeholder)'
  );

CREATE OR REPLACE VIEW "game"."component_gimbals" AS
SELECT "uuid", "env", "class_name", "name", "normalized_name", "canonical_component_key", "type", "sub_type", "size", "grade", "manufacturer_code", "hp", "is_bespoke", "game_component_category", "p4k_path", "created_at", "updated_at", "gimbal_max_angle", "gimbal_pitch_speed", "gimbal_yaw_speed"
FROM "game"."components"
WHERE "type" IN ('Gimbal')
  AND NOT (
    "class_name" ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
    OR "name" ~* '(^temps|stemps|temporary|template|placeholder)'
  );

CREATE OR REPLACE VIEW "game"."component_turrets" AS
SELECT "uuid", "env", "class_name", "name", "normalized_name", "canonical_component_key", "type", "sub_type", "size", "grade", "manufacturer_code", "hp", "is_bespoke", "game_component_category", "p4k_path", "created_at", "updated_at", "turret_max_pitch", "turret_max_yaw", "turret_min_pitch", "turret_min_yaw"
FROM "game"."components"
WHERE "type" IN ('Turret', 'TurretUnmanned')
  AND NOT (
    "class_name" ~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
    OR "name" ~* '(^temps|stemps|temporary|template|placeholder)'
  );
