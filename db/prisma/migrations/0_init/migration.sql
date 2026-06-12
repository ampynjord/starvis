-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "game";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "meta";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "rsi";

-- CreateEnum
CREATE TYPE "meta"."ExtractionStatus" AS ENUM ('success', 'partial', 'failed');

-- CreateEnum
CREATE TYPE "meta"."ChangelogEntityType" AS ENUM ('ship', 'component', 'item', 'commodity', 'shop', 'module', 'recipe');

-- CreateEnum
CREATE TYPE "meta"."ChangelogChangeType" AS ENUM ('added', 'removed', 'modified');

-- CreateEnum
CREATE TYPE "meta"."UserRole" AS ENUM ('user', 'developer', 'admin');

-- CreateEnum
CREATE TYPE "meta"."FleetItemType" AS ENUM ('ship', 'component', 'item', 'commodity', 'other');

-- CreateEnum
CREATE TYPE "meta"."CorporationMembershipRole" AS ENUM ('member', 'leader');

-- CreateEnum
CREATE TYPE "meta"."CorporationMembershipStatus" AS ENUM ('pending', 'active', 'rejected');

-- CreateTable
CREATE TABLE "meta"."extraction_log" (
    "id" SERIAL NOT NULL,
    "extraction_hash" CHAR(64) NOT NULL,
    "game_version" VARCHAR(50),
    "game_env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "ships_count" INTEGER NOT NULL DEFAULT 0,
    "components_count" INTEGER NOT NULL DEFAULT 0,
    "items_count" INTEGER NOT NULL DEFAULT 0,
    "commodities_count" INTEGER NOT NULL DEFAULT 0,
    "manufacturers_count" INTEGER NOT NULL DEFAULT 0,
    "loadout_ports_count" INTEGER NOT NULL DEFAULT 0,
    "shops_count" INTEGER NOT NULL DEFAULT 0,
    "recipes_count" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    "status" "meta"."ExtractionStatus" NOT NULL DEFAULT 'success',
    "error_message" TEXT,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extraction_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."changelog" (
    "id" SERIAL NOT NULL,
    "extraction_id" INTEGER NOT NULL,
    "entity_type" "meta"."ChangelogEntityType" NOT NULL,
    "entity_uuid" VARCHAR(255) NOT NULL,
    "entity_name" VARCHAR(255),
    "change_type" "meta"."ChangelogChangeType" NOT NULL,
    "field_name" VARCHAR(100),
    "old_value" TEXT,
    "new_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "changelog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."users" (
    "id" SERIAL NOT NULL,
    "uuid" VARCHAR(36) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "meta"."UserRole" NOT NULL DEFAULT 'user',
    "avatar_url" VARCHAR(500),
    "email_verified" BOOLEAN NOT NULL DEFAULT true,
    "verification_token" VARCHAR(255),
    "reset_token" VARCHAR(255),
    "reset_token_expiry" TIMESTAMP(3),
    "two_factor_secret" VARCHAR(255),
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."bug_reports" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "duplicate_of_id" INTEGER,
    "duplicate_comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."corporations" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "tag" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "logo_url" VARCHAR(500),
    "rsi_archetype" VARCHAR(50),
    "rsi_language" VARCHAR(50),
    "rsi_commitment" VARCHAR(20),
    "rsi_recruiting" BOOLEAN,
    "rsi_roleplay" BOOLEAN,
    "rsi_member_count" INTEGER,
    "rsi_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."corporation_memberships" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "corporation_id" INTEGER NOT NULL,
    "rank" VARCHAR(50),
    "role" "meta"."CorporationMembershipRole" NOT NULL DEFAULT 'member',
    "status" "meta"."CorporationMembershipStatus" NOT NULL DEFAULT 'active',
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "declared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corporation_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."corporation_fleet_items" (
    "id" SERIAL NOT NULL,
    "corporation_id" INTEGER,
    "item_type" "meta"."FleetItemType" NOT NULL,
    "item_class_name" VARCHAR(255) NOT NULL,
    "ship_uuid" VARCHAR(64),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "grid_x" DOUBLE PRECISION,
    "grid_z" DOUBLE PRECISION,
    "added_by_id" INTEGER,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporation_fleet_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsi"."ship_matrix" (
    "id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "chassis_id" INTEGER,
    "manufacturer_code" VARCHAR(10),
    "manufacturer_name" VARCHAR(100),
    "focus" VARCHAR(255),
    "type" VARCHAR(50),
    "description" TEXT,
    "production_status" VARCHAR(50),
    "production_note" TEXT,
    "size" VARCHAR(20),
    "url" VARCHAR(500),
    "length" DECIMAL(10,2),
    "beam" DECIMAL(10,2),
    "height" DECIMAL(10,2),
    "mass" INTEGER,
    "cargocapacity" INTEGER,
    "min_crew" INTEGER DEFAULT 1,
    "max_crew" INTEGER DEFAULT 1,
    "scm_speed" INTEGER,
    "afterburner_speed" INTEGER,
    "pitch_max" DECIMAL(10,2),
    "yaw_max" DECIMAL(10,2),
    "roll_max" DECIMAL(10,2),
    "xaxis_acceleration" DECIMAL(10,4),
    "yaxis_acceleration" DECIMAL(10,4),
    "zaxis_acceleration" DECIMAL(10,4),
    "media_source_url" TEXT,
    "media_store_small" TEXT,
    "media_store_large" TEXT,
    "ctm_url" VARCHAR(500),
    "compiled" JSONB,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ship_matrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsi"."galactapedia" (
    "id" VARCHAR(50) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "content" TEXT,
    "excerpt" VARCHAR(500),
    "type" VARCHAR(100),
    "template" VARCHAR(100),
    "categories" JSONB,
    "tags" JSONB,
    "categories_count" INTEGER,
    "tags_count" INTEGER,
    "related_articles_count" INTEGER,
    "thumbnail_url" VARCHAR(500),
    "rsi_url" VARCHAR(500),
    "api_url" VARCHAR(500),
    "web_url" VARCHAR(500),
    "source_created_at" TIMESTAMP(3),
    "raw_json" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "galactapedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsi"."comm_links" (
    "id" SERIAL NOT NULL,
    "rsi_id" VARCHAR(20) NOT NULL,
    "slug" VARCHAR(255),
    "title" VARCHAR(500) NOT NULL,
    "content" TEXT,
    "excerpt" VARCHAR(500),
    "category" VARCHAR(100),
    "source_category" VARCHAR(100),
    "channel" VARCHAR(100),
    "series" VARCHAR(100),
    "thumbnail_url" VARCHAR(500),
    "rsi_url" VARCHAR(500),
    "api_url" VARCHAR(500),
    "api_public_url" VARCHAR(500),
    "images_count" INTEGER,
    "links_count" INTEGER,
    "comment_count" INTEGER,
    "raw_json" JSONB,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "comm_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsi"."starmap_locations" (
    "id" SERIAL NOT NULL,
    "rsi_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20),
    "star_type" VARCHAR(50),
    "system_code" VARCHAR(20),
    "system_name" VARCHAR(255),
    "parent_id" VARCHAR(50),
    "faction_name" VARCHAR(100),
    "affiliations" JSONB,
    "thumbnail" VARCHAR(500),
    "description" TEXT,
    "web_url" VARCHAR(500),
    "coordinates" JSONB,
    "aggregated" JSONB,
    "size" DECIMAL(12,2),
    "population" DECIMAL(12,2),
    "economy" DECIMAL(12,2),
    "danger" DECIMAL(12,2),
    "frost_line" DECIMAL(12,2),
    "habitable_zone_inner" DECIMAL(12,2),
    "habitable_zone_outer" DECIMAL(12,2),
    "jump_points" JSONB,
    "raw_json" JSONB,
    "source_updated_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "starmap_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game"."manufacturers" (
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "known_for" VARCHAR(255),
    "logo_url" VARCHAR(500),
    "website_url" VARCHAR(500),

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "game"."ships" (
    "uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "class_name" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "manufacturer_code" VARCHAR(10),
    "role" VARCHAR(100),
    "career" VARCHAR(100),
    "crew_size" INTEGER DEFAULT 1,
    "size_x" DECIMAL(10,2),
    "size_y" DECIMAL(10,2),
    "size_z" DECIMAL(10,2),
    "mass" DECIMAL(15,2),
    "scm_speed" INTEGER,
    "max_speed" INTEGER,
    "boost_speed_forward" INTEGER,
    "boost_speed_backward" INTEGER,
    "pitch_max" DECIMAL(8,2),
    "yaw_max" DECIMAL(8,2),
    "roll_max" DECIMAL(8,2),
    "total_hp" INTEGER,
    "hydrogen_fuel_capacity" DECIMAL(10,2),
    "quantum_fuel_capacity" DECIMAL(10,2),
    "shield_hp" INTEGER,
    "shield_regen" DECIMAL(10,4),
    "shield_regen_delay" DECIMAL(10,2),
    "shield_down_delay" DECIMAL(10,2),
    "armor_physical" DECIMAL(10,6),
    "armor_energy" DECIMAL(10,6),
    "armor_distortion" DECIMAL(10,6),
    "armor_thermal" DECIMAL(10,6),
    "armor_signal_ir" DECIMAL(10,6),
    "armor_signal_em" DECIMAL(10,6),
    "armor_signal_cs" DECIMAL(10,6),
    "armor_hp" DECIMAL(10,2),
    "armor_phys_resist" DECIMAL(10,6),
    "armor_energy_resist" DECIMAL(10,6),
    "fuse_penetration" DECIMAL(10,4),
    "component_penetration" DECIMAL(10,4),
    "boost_ramp_up" DECIMAL(8,2),
    "boost_ramp_down" DECIMAL(8,2),
    "cross_section_x" DECIMAL(10,2),
    "cross_section_y" DECIMAL(10,2),
    "cross_section_z" DECIMAL(10,2),
    "short_name" VARCHAR(255),
    "cargo_capacity" DECIMAL(10,2),
    "missile_damage_total" DECIMAL(10,2),
    "weapon_damage_total" DECIMAL(10,2),
    "variant_type" VARCHAR(20),
    "vehicle_category" VARCHAR(20) DEFAULT 'ship',
    "chassis_id" INTEGER,
    "insurance_claim_time" DECIMAL(10,2),
    "insurance_expedite_cost" DECIMAL(10,2),
    "game_data" JSONB,
    "ship_matrix_id" INTEGER,
    "ctm_url" VARCHAR(500),
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ships_pkey" PRIMARY KEY ("uuid","env")
);

-- CreateTable
CREATE TABLE "game"."ship_loadouts" (
    "id" SERIAL NOT NULL,
    "ship_uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "port_name" VARCHAR(100) NOT NULL,
    "port_min_size" INTEGER,
    "port_max_size" INTEGER,
    "port_editable" BOOLEAN NOT NULL DEFAULT true,
    "component_class_name" VARCHAR(255),
    "component_uuid" CHAR(36),
    "port_type" VARCHAR(50),
    "parent_id" INTEGER,

    CONSTRAINT "ship_loadouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game"."ship_modules" (
    "id" SERIAL NOT NULL,
    "ship_uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "slot_name" VARCHAR(100) NOT NULL,
    "slot_display_name" VARCHAR(100),
    "slot_type" VARCHAR(20),
    "module_class_name" VARCHAR(255) NOT NULL,
    "module_name" VARCHAR(255),
    "module_tier" INTEGER,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "loadout_json" JSONB,

    CONSTRAINT "ship_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game"."ship_paints" (
    "id" SERIAL NOT NULL,
    "ship_uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "paint_class_name" VARCHAR(255) NOT NULL,
    "paint_name" VARCHAR(255),
    "paint_uuid" CHAR(36),

    CONSTRAINT "ship_paints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game"."components" (
    "uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "class_name" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "normalized_name" VARCHAR(255),
    "canonical_component_key" VARCHAR(255),
    "type" VARCHAR(50) NOT NULL,
    "game_component_category" VARCHAR(50),
    "sub_type" VARCHAR(100),
    "size" INTEGER,
    "grade" VARCHAR(10),
    "component_class" VARCHAR(30),
    "is_bespoke" BOOLEAN NOT NULL DEFAULT false,
    "manufacturer_code" VARCHAR(10),
    "mass" DECIMAL(10,2),
    "hp" INTEGER,
    "power_draw" DECIMAL(10,2),
    "power_base" DECIMAL(10,2),
    "power_output" DECIMAL(10,2),
    "heat_generation" DECIMAL(10,2),
    "cooling_rate" DECIMAL(15,2),
    "em_signature" DECIMAL(10,2),
    "ir_signature" DECIMAL(10,2),
    "weapon_damage" DECIMAL(10,4),
    "weapon_damage_type" VARCHAR(50),
    "weapon_fire_rate" DECIMAL(10,4),
    "weapon_range" DECIMAL(10,2),
    "weapon_speed" DECIMAL(10,2),
    "weapon_ammo_count" INTEGER,
    "weapon_pellets_per_shot" INTEGER DEFAULT 1,
    "weapon_burst_size" INTEGER,
    "weapon_alpha_damage" DECIMAL(10,4),
    "weapon_dps" DECIMAL(10,4),
    "weapon_damage_physical" DECIMAL(10,4),
    "weapon_damage_energy" DECIMAL(10,4),
    "weapon_damage_distortion" DECIMAL(10,4),
    "weapon_damage_thermal" DECIMAL(10,4),
    "weapon_damage_biochemical" DECIMAL(10,4),
    "weapon_damage_stun" DECIMAL(10,4),
    "weapon_burst_dps" DECIMAL(10,4),
    "weapon_sustained_dps" DECIMAL(10,4),
    "weapon_full_damage_range" DECIMAL(10,2),
    "weapon_zero_damage_range" DECIMAL(10,2),
    "weapon_heat_per_second" DECIMAL(10,4),
    "weapon_beam_capacity" DECIMAL(10,2),
    "weapon_beam_regen_cooldown" DECIMAL(10,2),
    "weapon_beam_dps" DECIMAL(10,4),
    "shield_hp" DECIMAL(15,2),
    "shield_regen" DECIMAL(10,4),
    "shield_regen_delay" DECIMAL(10,2),
    "shield_hardening" DECIMAL(10,4),
    "shield_faces" INTEGER,
    "qd_speed" DECIMAL(15,2),
    "qd_spool_time" DECIMAL(10,2),
    "qd_cooldown" DECIMAL(10,2),
    "qd_fuel_rate" DECIMAL(10,6),
    "qd_range" DECIMAL(15,2),
    "qd_stage1_accel" DECIMAL(15,2),
    "qd_stage2_accel" DECIMAL(15,2),
    "qd_tuning_rate" DECIMAL(10,4),
    "qd_alignment_rate" DECIMAL(10,4),
    "qd_disconnect_range" DECIMAL(15,2),
    "missile_damage" DECIMAL(10,2),
    "missile_signal_type" VARCHAR(20),
    "missile_lock_time" DECIMAL(10,2),
    "missile_speed" DECIMAL(10,2),
    "missile_range" DECIMAL(10,2),
    "missile_lock_range" DECIMAL(10,2),
    "missile_damage_physical" DECIMAL(10,2),
    "missile_damage_energy" DECIMAL(10,2),
    "missile_damage_distortion" DECIMAL(10,2),
    "missile_damage_thermal" DECIMAL(10,2),
    "missile_damage_biochemical" DECIMAL(10,2),
    "missile_damage_stun" DECIMAL(10,2),
    "thruster_max_thrust" DECIMAL(15,2),
    "thruster_type" VARCHAR(50),
    "radar_range" DECIMAL(15,2),
    "radar_detection_lifetime" DECIMAL(10,2),
    "radar_tracking_signal" DECIMAL(10,4),
    "cm_ammo_count" INTEGER,
    "fuel_capacity" DECIMAL(10,2),
    "fuel_intake_rate" DECIMAL(10,4),
    "emp_damage" DECIMAL(10,2),
    "emp_radius" DECIMAL(10,2),
    "emp_charge_time" DECIMAL(10,2),
    "emp_cooldown" DECIMAL(10,2),
    "qig_jammer_range" DECIMAL(15,2),
    "qig_snare_radius" DECIMAL(15,2),
    "qig_charge_time" DECIMAL(10,2),
    "qig_cooldown" DECIMAL(10,2),
    "mining_speed" DECIMAL(10,4),
    "mining_range" DECIMAL(10,2),
    "mining_resistance" DECIMAL(10,4),
    "mining_instability" DECIMAL(10,4),
    "tractor_max_force" DECIMAL(15,2),
    "tractor_max_range" DECIMAL(10,2),
    "salvage_speed" DECIMAL(10,4),
    "salvage_radius" DECIMAL(10,2),
    "salvage_range" DECIMAL(10,2),
    "gimbal_type" VARCHAR(20),
    "gimbal_max_angle" DECIMAL(8,2),
    "gimbal_pitch_speed" DECIMAL(8,2),
    "gimbal_yaw_speed" DECIMAL(8,2),
    "turret_min_pitch" DECIMAL(8,2),
    "turret_max_pitch" DECIMAL(8,2),
    "turret_min_yaw" DECIMAL(8,2),
    "turret_max_yaw" DECIMAL(8,2),
    "rack_count" INTEGER,
    "rack_missile_size" INTEGER,
    "radar_ping_range" DECIMAL(15,2),
    "radar_ping_cooldown" DECIMAL(10,2),
    "shield_downed_regen_delay" DECIMAL(10,2),
    "weapon_heat_per_shot" DECIMAL(10,4),
    "weapon_charge_time" DECIMAL(10,2),
    "cm_type" VARCHAR(20),
    "missile_explosion_radius" DECIMAL(10,2),
    "missile_guidance_mode" VARCHAR(50),
    "qd_calibration_rate" DECIMAL(10,4),
    "qd_calibration_delay" DECIMAL(10,2),
    "qd_calibration_max_angle" DECIMAL(8,2),
    "p4k_path" VARCHAR(500),
    "raw_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "components_pkey" PRIMARY KEY ("uuid","env")
);

-- CreateTable
CREATE TABLE "game"."items" (
    "uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "class_name" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "normalized_name" VARCHAR(255),
    "canonical_item_key" VARCHAR(255),
    "type" VARCHAR(50) NOT NULL,
    "sub_type" VARCHAR(100),
    "size" INTEGER,
    "grade" VARCHAR(10),
    "manufacturer_code" VARCHAR(10),
    "mass" DECIMAL(10,2),
    "hp" INTEGER,
    "weapon_damage" DECIMAL(10,4),
    "weapon_damage_type" VARCHAR(50),
    "weapon_fire_rate" DECIMAL(10,4),
    "weapon_range" DECIMAL(10,2),
    "weapon_speed" DECIMAL(10,2),
    "weapon_ammo_count" INTEGER,
    "weapon_dps" DECIMAL(10,4),
    "armor_damage_reduction" DECIMAL(10,4),
    "armor_temp_min" DECIMAL(10,2),
    "armor_temp_max" DECIMAL(10,2),
    "data_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "items_pkey" PRIMARY KEY ("uuid","env")
);

-- CreateTable
CREATE TABLE "game"."commodities" (
    "uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "class_name" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "normalized_name" VARCHAR(255),
    "canonical_commodity_key" VARCHAR(255),
    "type" VARCHAR(50) NOT NULL,
    "sub_type" VARCHAR(100),
    "symbol" VARCHAR(20),
    "occupancy_scu" DECIMAL(10,4),
    "data_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commodities_pkey" PRIMARY KEY ("uuid","env")
);

-- CreateTable
CREATE TABLE "game"."shops" (
    "id" SERIAL NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "name" VARCHAR(255) NOT NULL,
    "class_name" VARCHAR(255) NOT NULL,
    "normalized_name" VARCHAR(255),
    "canonical_shop_key" VARCHAR(255),
    "canonical_location_key" VARCHAR(255),
    "location" VARCHAR(255),
    "system" VARCHAR(50),
    "planet_moon" VARCHAR(100),
    "city" VARCHAR(100),
    "shop_type" VARCHAR(50),
    "franchise_slug" VARCHAR(100),
    "location_slug" VARCHAR(100),
    "franchise_loc_key" VARCHAR(255),
    "p4k_path" VARCHAR(500),
    "raw_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game"."shop_inventory" (
    "id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "component_uuid" CHAR(36),
    "component_class_name" VARCHAR(255) NOT NULL,
    "base_price" DECIMAL(12,2),
    "rental_price_1d" DECIMAL(12,2),
    "rental_price_3d" DECIMAL(12,2),
    "rental_price_7d" DECIMAL(12,2),
    "rental_price_30d" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game"."commodity_prices" (
    "id" SERIAL NOT NULL,
    "commodity_uuid" CHAR(36) NOT NULL,
    "commodity_env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "shop_id" INTEGER NOT NULL,
    "buy_price" DECIMAL(12,2),
    "sell_price" DECIMAL(12,2),
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commodity_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game"."mining_elements" (
    "uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "class_name" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "commodity_uuid" CHAR(36),
    "instability" DECIMAL(8,2),
    "resistance" DECIMAL(6,4),
    "optimal_window_midpoint" DECIMAL(6,4),
    "optimal_window_midpoint_rand" DECIMAL(6,4),
    "optimal_window_thinness" DECIMAL(6,4),
    "explosion_multiplier" DECIMAL(8,2),
    "cluster_factor" DECIMAL(6,4),
    "p4k_path" VARCHAR(500),
    "raw_json" JSONB,

    CONSTRAINT "mining_elements_pkey" PRIMARY KEY ("uuid","env")
);

-- CreateTable
CREATE TABLE "game"."mining_compositions" (
    "uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "class_name" VARCHAR(255) NOT NULL,
    "deposit_name" VARCHAR(255),
    "min_distinct_elements" INTEGER,
    "p4k_path" VARCHAR(500),
    "raw_json" JSONB,

    CONSTRAINT "mining_compositions_pkey" PRIMARY KEY ("uuid","env")
);

-- CreateTable
CREATE TABLE "game"."mining_composition_parts" (
    "id" SERIAL NOT NULL,
    "composition_uuid" CHAR(36) NOT NULL,
    "composition_env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "element_uuid" CHAR(36) NOT NULL,
    "element_env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "min_percentage" DECIMAL(6,2),
    "max_percentage" DECIMAL(6,2),
    "probability" DECIMAL(6,4),
    "curve_exponent" DECIMAL(6,4),

    CONSTRAINT "mining_composition_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game"."missions" (
    "uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "class_name" VARCHAR(300) NOT NULL,
    "title" VARCHAR(500),
    "description" TEXT,
    "mission_type" VARCHAR(100),
    "can_be_shared" BOOLEAN NOT NULL DEFAULT false,
    "only_owner_complete" BOOLEAN NOT NULL DEFAULT false,
    "is_legal" BOOLEAN NOT NULL DEFAULT true,
    "completion_time_s" INTEGER,
    "not_for_release" BOOLEAN NOT NULL DEFAULT false,
    "work_in_progress" BOOLEAN NOT NULL DEFAULT false,
    "reward_min" INTEGER,
    "reward_max" INTEGER,
    "reward_currency" VARCHAR(20),
    "faction" VARCHAR(100),
    "mission_giver" VARCHAR(200),
    "location_system" VARCHAR(100),
    "location_planet" VARCHAR(100),
    "location_name" VARCHAR(200),
    "danger_level" INTEGER,
    "required_reputation" INTEGER,
    "reputation_reward" INTEGER,
    "buy_in_amount" INTEGER,
    "base_xp" INTEGER,
    "category" VARCHAR(50),
    "is_unique" BOOLEAN NOT NULL DEFAULT false,
    "has_blueprint_reward" BOOLEAN NOT NULL DEFAULT false,
    "blueprint_reward_uuid" CHAR(36),
    "blueprint_reward_env" VARCHAR(10) DEFAULT 'live',
    "p4k_path" VARCHAR(500),
    "raw_json" JSONB,

    CONSTRAINT "missions_pkey" PRIMARY KEY ("uuid","env")
);

-- CreateTable
CREATE TABLE "game"."crafting_recipes" (
    "uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "class_name" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "category" VARCHAR(50),
    "output_item_name" VARCHAR(255),
    "output_item_uuid" CHAR(36),
    "output_quantity" INTEGER NOT NULL DEFAULT 1,
    "crafting_time_s" INTEGER,
    "station_type" VARCHAR(100),
    "skill_level" INTEGER,
    "p4k_path" VARCHAR(500),
    "raw_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crafting_recipes_pkey" PRIMARY KEY ("uuid","env")
);

-- CreateTable
CREATE TABLE "game"."mission_blueprint_rewards" (
    "id" SERIAL NOT NULL,
    "mission_uuid" CHAR(36) NOT NULL,
    "mission_env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "blueprint_uuid" CHAR(36) NOT NULL,
    "blueprint_env" VARCHAR(10) NOT NULL DEFAULT 'live',

    CONSTRAINT "mission_blueprint_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game"."crafting_ingredients" (
    "id" SERIAL NOT NULL,
    "recipe_uuid" CHAR(36) NOT NULL,
    "recipe_env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "item_name" VARCHAR(255) NOT NULL,
    "item_uuid" CHAR(36),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "scu" DECIMAL(10,4),
    "min_quality" INTEGER NOT NULL DEFAULT 0,
    "slot_name" VARCHAR(255),

    CONSTRAINT "crafting_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game"."crafting_slot_modifiers" (
    "id" SERIAL NOT NULL,
    "recipe_uuid" CHAR(36) NOT NULL,
    "recipe_env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "slot_name" VARCHAR(255) NOT NULL,
    "property_name" VARCHAR(255) NOT NULL,
    "property_uuid" CHAR(36) NOT NULL,
    "unit_format" VARCHAR(100) NOT NULL DEFAULT '',
    "start_quality" INTEGER NOT NULL DEFAULT 0,
    "end_quality" INTEGER NOT NULL DEFAULT 1000,
    "modifier_at_start" DECIMAL(10,6) NOT NULL,
    "modifier_at_end" DECIMAL(10,6) NOT NULL,
    "modifier_type" VARCHAR(100),

    CONSTRAINT "crafting_slot_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game"."locations" (
    "uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "class_name" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "system_code" VARCHAR(20),
    "parent_uuid" CHAR(36),
    "rsi_starmap_location_id" INTEGER,
    "loc_key" VARCHAR(255),
    "description" TEXT,
    "coordinates" JSONB,
    "p4k_path" VARCHAR(500),
    "raw_json" JSONB,
    "is_scannable" BOOLEAN NOT NULL DEFAULT false,
    "hide_in_starmap" BOOLEAN NOT NULL DEFAULT false,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("uuid","env")
);

-- CreateTable
CREATE TABLE "game"."game_insights" (
    "uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "category" VARCHAR(50) NOT NULL,
    "source_type" VARCHAR(100) NOT NULL,
    "class_name" VARCHAR(300),
    "name" VARCHAR(500),
    "subtype" VARCHAR(100),
    "related_class" VARCHAR(300),
    "related_uuid" CHAR(36),
    "location_hint" VARCHAR(300),
    "faction" VARCHAR(150),
    "reputation_key" VARCHAR(200),
    "value_numeric" DECIMAL(15,4),
    "value_text" TEXT,
    "p4k_path" VARCHAR(500),
    "raw_json" JSONB,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_insights_pkey" PRIMARY KEY ("uuid","env","category")
);

-- CreateTable
CREATE TABLE "game"."factions" (
    "uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "class_name" VARCHAR(300) NOT NULL,
    "name" VARCHAR(500),
    "description" TEXT,
    "faction_type" VARCHAR(100),
    "default_reaction" VARCHAR(100),
    "able_to_arrest" BOOLEAN,
    "no_legal_rights" BOOLEAN,
    "polices_criminality" BOOLEAN,
    "polices_lawful_trespass" BOOLEAN,
    "faction_reputation_uuid" CHAR(36),
    "allies" JSONB,
    "enemies" JSONB,
    "organization_tags" JSONB,
    "string_variants" JSONB,
    "p4k_path" VARCHAR(500),
    "raw_json" JSONB,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "factions_pkey" PRIMARY KEY ("uuid","env")
);

-- CreateTable
CREATE TABLE "game"."reputation_standings" (
    "uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "class_name" VARCHAR(300) NOT NULL,
    "name" VARCHAR(255),
    "display_name" VARCHAR(500),
    "description" TEXT,
    "icon" VARCHAR(500),
    "min_reputation" INTEGER,
    "drift_time_hours" DECIMAL(10,2),
    "drift_reputation" INTEGER,
    "gated" BOOLEAN NOT NULL DEFAULT false,
    "perk_description" TEXT,
    "p4k_path" VARCHAR(500),
    "raw_json" JSONB,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_standings_pkey" PRIMARY KEY ("uuid","env")
);

-- CreateTable
CREATE TABLE "game"."reputation_scopes" (
    "uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "class_name" VARCHAR(300) NOT NULL,
    "scope_name" VARCHAR(255),
    "display_name" VARCHAR(500),
    "description" TEXT,
    "icon" VARCHAR(500),
    "initial_reputation" INTEGER,
    "reputation_ceiling" INTEGER,
    "standings" JSONB,
    "p4k_path" VARCHAR(500),
    "raw_json" JSONB,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_scopes_pkey" PRIMARY KEY ("uuid","env")
);

-- CreateTable
CREATE TABLE "game"."loot_tables" (
    "uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "class_name" VARCHAR(300) NOT NULL,
    "name" VARCHAR(500),
    "p4k_path" VARCHAR(500),
    "raw_json" JSONB,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loot_tables_pkey" PRIMARY KEY ("uuid","env")
);

-- CreateTable
CREATE TABLE "game"."loot_table_entries" (
    "id" SERIAL NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "table_uuid" CHAR(36) NOT NULL,
    "table_class_name" VARCHAR(300),
    "entry_index" INTEGER NOT NULL,
    "archetype_uuid" CHAR(36),
    "archetype_class_name" VARCHAR(300),
    "weight" DECIMAL(12,4),
    "min_results" INTEGER,
    "max_results" INTEGER,
    "raw_json" JSONB,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loot_table_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game"."loot_archetypes" (
    "uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "class_name" VARCHAR(300) NOT NULL,
    "name" VARCHAR(500),
    "primary_entries" JSONB,
    "secondary_entries" JSONB,
    "excluded_tags" JSONB,
    "p4k_path" VARCHAR(500),
    "raw_json" JSONB,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loot_archetypes_pkey" PRIMARY KEY ("uuid","env")
);

-- CreateTable
CREATE TABLE "game"."blueprint_rewards" (
    "id" SERIAL NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "pool_uuid" CHAR(36) NOT NULL,
    "pool_class_name" VARCHAR(300),
    "reward_index" INTEGER NOT NULL,
    "blueprint_uuid" CHAR(36),
    "blueprint_class_name" VARCHAR(300),
    "weight" DECIMAL(12,4),
    "raw_json" JSONB,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blueprint_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game"."ammo" (
    "uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "class_name" VARCHAR(300) NOT NULL,
    "name" VARCHAR(500),
    "size" INTEGER,
    "speed" DECIMAL(12,2),
    "lifetime" DECIMAL(12,4),
    "ammo_category" VARCHAR(100),
    "conversion_rate_micro_scu" DECIMAL(15,4),
    "damage_physical" DECIMAL(12,4),
    "damage_energy" DECIMAL(12,4),
    "damage_distortion" DECIMAL(12,4),
    "damage_thermal" DECIMAL(12,4),
    "damage_biochemical" DECIMAL(12,4),
    "damage_stun" DECIMAL(12,4),
    "explosion_damage_physical" DECIMAL(12,4),
    "explosion_damage_energy" DECIMAL(12,4),
    "explosion_damage_distortion" DECIMAL(12,4),
    "explosion_damage_thermal" DECIMAL(12,4),
    "explosion_damage_biochemical" DECIMAL(12,4),
    "explosion_damage_stun" DECIMAL(12,4),
    "impact_radius" DECIMAL(12,4),
    "explosion_min_radius" DECIMAL(12,4),
    "explosion_max_radius" DECIMAL(12,4),
    "mass" DECIMAL(12,4),
    "p4k_path" VARCHAR(500),
    "raw_json" JSONB,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ammo_pkey" PRIMARY KEY ("uuid","env")
);

-- CreateTable
CREATE TABLE "game"."inventory_containers" (
    "uuid" CHAR(36) NOT NULL,
    "env" VARCHAR(10) NOT NULL DEFAULT 'live',
    "class_name" VARCHAR(300) NOT NULL,
    "name" VARCHAR(500),
    "inventory_type" VARCHAR(100),
    "capacity_micro_scu" DECIMAL(15,4),
    "capacity_scu" DECIMAL(12,6),
    "size_x" DECIMAL(12,4),
    "size_y" DECIMAL(12,4),
    "size_z" DECIMAL(12,4),
    "excluded_item_subtypes" JSONB,
    "p4k_path" VARCHAR(500),
    "raw_json" JSONB,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_containers_pkey" PRIMARY KEY ("uuid","env")
);

-- CreateIndex
CREATE INDEX "extraction_log_extraction_hash_idx" ON "meta"."extraction_log"("extraction_hash");

-- CreateIndex
CREATE INDEX "extraction_log_game_env_idx" ON "meta"."extraction_log"("game_env");

-- CreateIndex
CREATE INDEX "changelog_extraction_id_idx" ON "meta"."changelog"("extraction_id");

-- CreateIndex
CREATE INDEX "changelog_entity_type_entity_uuid_idx" ON "meta"."changelog"("entity_type", "entity_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "users_uuid_key" ON "meta"."users"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "meta"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "meta"."users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_verification_token_key" ON "meta"."users"("verification_token");

-- CreateIndex
CREATE UNIQUE INDEX "users_reset_token_key" ON "meta"."users"("reset_token");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "meta"."users"("email");

-- CreateIndex
CREATE INDEX "bug_reports_user_id_idx" ON "meta"."bug_reports"("user_id");

-- CreateIndex
CREATE INDEX "bug_reports_status_idx" ON "meta"."bug_reports"("status");

-- CreateIndex
CREATE INDEX "bug_reports_duplicate_of_id_idx" ON "meta"."bug_reports"("duplicate_of_id");

-- CreateIndex
CREATE INDEX "bug_reports_created_at_idx" ON "meta"."bug_reports"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "corporations_name_key" ON "meta"."corporations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "corporations_tag_key" ON "meta"."corporations"("tag");

-- CreateIndex
CREATE INDEX "corporation_memberships_corporation_id_idx" ON "meta"."corporation_memberships"("corporation_id");

-- CreateIndex
CREATE INDEX "corporation_memberships_corporation_id_status_idx" ON "meta"."corporation_memberships"("corporation_id", "status");

-- CreateIndex
CREATE INDEX "corporation_memberships_user_id_status_idx" ON "meta"."corporation_memberships"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "corporation_memberships_user_id_corporation_id_key" ON "meta"."corporation_memberships"("user_id", "corporation_id");

-- CreateIndex
CREATE INDEX "corporation_fleet_items_corporation_id_idx" ON "meta"."corporation_fleet_items"("corporation_id");

-- CreateIndex
CREATE INDEX "corporation_fleet_items_added_by_id_item_type_idx" ON "meta"."corporation_fleet_items"("added_by_id", "item_type");

-- CreateIndex
CREATE INDEX "galactapedia_slug_idx" ON "rsi"."galactapedia"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "comm_links_rsi_id_key" ON "rsi"."comm_links"("rsi_id");

-- CreateIndex
CREATE INDEX "comm_links_category_idx" ON "rsi"."comm_links"("category");

-- CreateIndex
CREATE INDEX "comm_links_published_at_idx" ON "rsi"."comm_links"("published_at");

-- CreateIndex
CREATE UNIQUE INDEX "starmap_locations_rsi_id_key" ON "rsi"."starmap_locations"("rsi_id");

-- CreateIndex
CREATE INDEX "starmap_locations_system_code_idx" ON "rsi"."starmap_locations"("system_code");

-- CreateIndex
CREATE INDEX "starmap_locations_parent_id_idx" ON "rsi"."starmap_locations"("parent_id");

-- CreateIndex
CREATE INDEX "starmap_locations_type_idx" ON "rsi"."starmap_locations"("type");

-- CreateIndex
CREATE INDEX "ships_manufacturer_code_idx" ON "game"."ships"("manufacturer_code");

-- CreateIndex
CREATE INDEX "ships_ship_matrix_id_idx" ON "game"."ships"("ship_matrix_id");

-- CreateIndex
CREATE INDEX "ships_chassis_id_idx" ON "game"."ships"("chassis_id");

-- CreateIndex
CREATE INDEX "ships_env_idx" ON "game"."ships"("env");

-- CreateIndex
CREATE UNIQUE INDEX "ships_class_name_env_key" ON "game"."ships"("class_name", "env");

-- CreateIndex
CREATE INDEX "ship_loadouts_ship_uuid_env_idx" ON "game"."ship_loadouts"("ship_uuid", "env");

-- CreateIndex
CREATE INDEX "ship_loadouts_component_uuid_idx" ON "game"."ship_loadouts"("component_uuid");

-- CreateIndex
CREATE INDEX "ship_modules_ship_uuid_env_idx" ON "game"."ship_modules"("ship_uuid", "env");

-- CreateIndex
CREATE INDEX "ship_paints_ship_uuid_env_idx" ON "game"."ship_paints"("ship_uuid", "env");

-- CreateIndex
CREATE INDEX "components_manufacturer_code_idx" ON "game"."components"("manufacturer_code");

-- CreateIndex
CREATE INDEX "components_type_idx" ON "game"."components"("type");

-- CreateIndex
CREATE INDEX "components_game_component_category_idx" ON "game"."components"("game_component_category");

-- CreateIndex
CREATE INDEX "components_sub_type_idx" ON "game"."components"("sub_type");

-- CreateIndex
CREATE INDEX "components_component_class_idx" ON "game"."components"("component_class");

-- CreateIndex
CREATE INDEX "components_is_bespoke_idx" ON "game"."components"("is_bespoke");

-- CreateIndex
CREATE INDEX "components_canonical_component_key_idx" ON "game"."components"("canonical_component_key");

-- CreateIndex
CREATE INDEX "components_env_idx" ON "game"."components"("env");

-- CreateIndex
CREATE UNIQUE INDEX "components_class_name_env_key" ON "game"."components"("class_name", "env");

-- CreateIndex
CREATE INDEX "items_canonical_item_key_idx" ON "game"."items"("canonical_item_key");

-- CreateIndex
CREATE INDEX "items_manufacturer_code_idx" ON "game"."items"("manufacturer_code");

-- CreateIndex
CREATE INDEX "items_env_idx" ON "game"."items"("env");

-- CreateIndex
CREATE UNIQUE INDEX "items_class_name_env_key" ON "game"."items"("class_name", "env");

-- CreateIndex
CREATE INDEX "commodities_canonical_commodity_key_idx" ON "game"."commodities"("canonical_commodity_key");

-- CreateIndex
CREATE INDEX "commodities_env_idx" ON "game"."commodities"("env");

-- CreateIndex
CREATE UNIQUE INDEX "commodities_class_name_env_key" ON "game"."commodities"("class_name", "env");

-- CreateIndex
CREATE INDEX "shops_canonical_shop_key_idx" ON "game"."shops"("canonical_shop_key");

-- CreateIndex
CREATE INDEX "shops_canonical_location_key_idx" ON "game"."shops"("canonical_location_key");

-- CreateIndex
CREATE INDEX "shops_env_idx" ON "game"."shops"("env");

-- CreateIndex
CREATE UNIQUE INDEX "shops_class_name_env_key" ON "game"."shops"("class_name", "env");

-- CreateIndex
CREATE INDEX "shop_inventory_shop_id_idx" ON "game"."shop_inventory"("shop_id");

-- CreateIndex
CREATE INDEX "shop_inventory_component_uuid_idx" ON "game"."shop_inventory"("component_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "shop_inventory_shop_id_component_class_name_key" ON "game"."shop_inventory"("shop_id", "component_class_name");

-- CreateIndex
CREATE INDEX "commodity_prices_shop_id_idx" ON "game"."commodity_prices"("shop_id");

-- CreateIndex
CREATE INDEX "commodity_prices_commodity_uuid_idx" ON "game"."commodity_prices"("commodity_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "commodity_prices_commodity_uuid_shop_id_key" ON "game"."commodity_prices"("commodity_uuid", "shop_id");

-- CreateIndex
CREATE INDEX "mining_elements_env_idx" ON "game"."mining_elements"("env");

-- CreateIndex
CREATE UNIQUE INDEX "mining_elements_class_name_env_key" ON "game"."mining_elements"("class_name", "env");

-- CreateIndex
CREATE INDEX "mining_compositions_env_idx" ON "game"."mining_compositions"("env");

-- CreateIndex
CREATE UNIQUE INDEX "mining_compositions_class_name_env_key" ON "game"."mining_compositions"("class_name", "env");

-- CreateIndex
CREATE INDEX "mining_composition_parts_composition_uuid_composition_env_idx" ON "game"."mining_composition_parts"("composition_uuid", "composition_env");

-- CreateIndex
CREATE INDEX "mining_composition_parts_element_uuid_element_env_idx" ON "game"."mining_composition_parts"("element_uuid", "element_env");

-- CreateIndex
CREATE INDEX "missions_mission_type_idx" ON "game"."missions"("mission_type");

-- CreateIndex
CREATE INDEX "missions_faction_idx" ON "game"."missions"("faction");

-- CreateIndex
CREATE INDEX "missions_location_system_idx" ON "game"."missions"("location_system");

-- CreateIndex
CREATE INDEX "missions_category_idx" ON "game"."missions"("category");

-- CreateIndex
CREATE INDEX "missions_env_idx" ON "game"."missions"("env");

-- CreateIndex
CREATE UNIQUE INDEX "missions_class_name_env_key" ON "game"."missions"("class_name", "env");

-- CreateIndex
CREATE INDEX "crafting_recipes_category_idx" ON "game"."crafting_recipes"("category");

-- CreateIndex
CREATE INDEX "crafting_recipes_env_idx" ON "game"."crafting_recipes"("env");

-- CreateIndex
CREATE UNIQUE INDEX "crafting_recipes_class_name_env_key" ON "game"."crafting_recipes"("class_name", "env");

-- CreateIndex
CREATE INDEX "mission_blueprint_rewards_blueprint_uuid_idx" ON "game"."mission_blueprint_rewards"("blueprint_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "mission_blueprint_rewards_mission_uuid_blueprint_uuid_key" ON "game"."mission_blueprint_rewards"("mission_uuid", "blueprint_uuid");

-- CreateIndex
CREATE INDEX "crafting_ingredients_recipe_uuid_recipe_env_idx" ON "game"."crafting_ingredients"("recipe_uuid", "recipe_env");

-- CreateIndex
CREATE INDEX "crafting_slot_modifiers_recipe_uuid_recipe_env_idx" ON "game"."crafting_slot_modifiers"("recipe_uuid", "recipe_env");

-- CreateIndex
CREATE INDEX "locations_type_idx" ON "game"."locations"("type");

-- CreateIndex
CREATE INDEX "locations_system_code_idx" ON "game"."locations"("system_code");

-- CreateIndex
CREATE INDEX "locations_parent_uuid_idx" ON "game"."locations"("parent_uuid");

-- CreateIndex
CREATE INDEX "locations_rsi_starmap_location_id_idx" ON "game"."locations"("rsi_starmap_location_id");

-- CreateIndex
CREATE INDEX "locations_env_idx" ON "game"."locations"("env");

-- CreateIndex
CREATE UNIQUE INDEX "locations_class_name_env_key" ON "game"."locations"("class_name", "env");

-- CreateIndex
CREATE INDEX "game_insights_category_idx" ON "game"."game_insights"("category");

-- CreateIndex
CREATE INDEX "game_insights_source_type_idx" ON "game"."game_insights"("source_type");

-- CreateIndex
CREATE INDEX "game_insights_class_name_idx" ON "game"."game_insights"("class_name");

-- CreateIndex
CREATE INDEX "game_insights_related_class_idx" ON "game"."game_insights"("related_class");

-- CreateIndex
CREATE INDEX "game_insights_faction_idx" ON "game"."game_insights"("faction");

-- CreateIndex
CREATE INDEX "game_insights_reputation_key_idx" ON "game"."game_insights"("reputation_key");

-- CreateIndex
CREATE INDEX "game_insights_env_idx" ON "game"."game_insights"("env");

-- CreateIndex
CREATE INDEX "factions_faction_type_idx" ON "game"."factions"("faction_type");

-- CreateIndex
CREATE INDEX "factions_faction_reputation_uuid_idx" ON "game"."factions"("faction_reputation_uuid");

-- CreateIndex
CREATE INDEX "factions_env_idx" ON "game"."factions"("env");

-- CreateIndex
CREATE UNIQUE INDEX "factions_class_name_env_key" ON "game"."factions"("class_name", "env");

-- CreateIndex
CREATE INDEX "reputation_standings_min_reputation_idx" ON "game"."reputation_standings"("min_reputation");

-- CreateIndex
CREATE INDEX "reputation_standings_env_idx" ON "game"."reputation_standings"("env");

-- CreateIndex
CREATE UNIQUE INDEX "reputation_standings_class_name_env_key" ON "game"."reputation_standings"("class_name", "env");

-- CreateIndex
CREATE INDEX "reputation_scopes_scope_name_idx" ON "game"."reputation_scopes"("scope_name");

-- CreateIndex
CREATE INDEX "reputation_scopes_env_idx" ON "game"."reputation_scopes"("env");

-- CreateIndex
CREATE UNIQUE INDEX "reputation_scopes_class_name_env_key" ON "game"."reputation_scopes"("class_name", "env");

-- CreateIndex
CREATE INDEX "loot_tables_env_idx" ON "game"."loot_tables"("env");

-- CreateIndex
CREATE UNIQUE INDEX "loot_tables_class_name_env_key" ON "game"."loot_tables"("class_name", "env");

-- CreateIndex
CREATE INDEX "loot_table_entries_table_uuid_env_idx" ON "game"."loot_table_entries"("table_uuid", "env");

-- CreateIndex
CREATE INDEX "loot_table_entries_archetype_uuid_idx" ON "game"."loot_table_entries"("archetype_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "loot_table_entries_env_table_uuid_entry_index_key" ON "game"."loot_table_entries"("env", "table_uuid", "entry_index");

-- CreateIndex
CREATE INDEX "loot_archetypes_env_idx" ON "game"."loot_archetypes"("env");

-- CreateIndex
CREATE UNIQUE INDEX "loot_archetypes_class_name_env_key" ON "game"."loot_archetypes"("class_name", "env");

-- CreateIndex
CREATE INDEX "blueprint_rewards_pool_uuid_env_idx" ON "game"."blueprint_rewards"("pool_uuid", "env");

-- CreateIndex
CREATE INDEX "blueprint_rewards_blueprint_uuid_idx" ON "game"."blueprint_rewards"("blueprint_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "blueprint_rewards_env_pool_uuid_reward_index_key" ON "game"."blueprint_rewards"("env", "pool_uuid", "reward_index");

-- CreateIndex
CREATE INDEX "ammo_ammo_category_idx" ON "game"."ammo"("ammo_category");

-- CreateIndex
CREATE INDEX "ammo_size_idx" ON "game"."ammo"("size");

-- CreateIndex
CREATE INDEX "ammo_env_idx" ON "game"."ammo"("env");

-- CreateIndex
CREATE UNIQUE INDEX "ammo_class_name_env_key" ON "game"."ammo"("class_name", "env");

-- CreateIndex
CREATE INDEX "inventory_containers_inventory_type_idx" ON "game"."inventory_containers"("inventory_type");

-- CreateIndex
CREATE INDEX "inventory_containers_capacity_micro_scu_idx" ON "game"."inventory_containers"("capacity_micro_scu");

-- CreateIndex
CREATE INDEX "inventory_containers_env_idx" ON "game"."inventory_containers"("env");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_containers_class_name_env_key" ON "game"."inventory_containers"("class_name", "env");

-- AddForeignKey
ALTER TABLE "meta"."changelog" ADD CONSTRAINT "changelog_extraction_id_fkey" FOREIGN KEY ("extraction_id") REFERENCES "meta"."extraction_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."bug_reports" ADD CONSTRAINT "bug_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "meta"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."bug_reports" ADD CONSTRAINT "bug_reports_duplicate_of_id_fkey" FOREIGN KEY ("duplicate_of_id") REFERENCES "meta"."bug_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."corporation_memberships" ADD CONSTRAINT "corporation_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "meta"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."corporation_memberships" ADD CONSTRAINT "corporation_memberships_corporation_id_fkey" FOREIGN KEY ("corporation_id") REFERENCES "meta"."corporations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."corporation_fleet_items" ADD CONSTRAINT "corporation_fleet_items_corporation_id_fkey" FOREIGN KEY ("corporation_id") REFERENCES "meta"."corporations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."corporation_fleet_items" ADD CONSTRAINT "corporation_fleet_items_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "meta"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game"."ship_loadouts" ADD CONSTRAINT "ship_loadouts_ship_uuid_env_fkey" FOREIGN KEY ("ship_uuid", "env") REFERENCES "game"."ships"("uuid", "env") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game"."ship_modules" ADD CONSTRAINT "ship_modules_ship_uuid_env_fkey" FOREIGN KEY ("ship_uuid", "env") REFERENCES "game"."ships"("uuid", "env") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game"."ship_paints" ADD CONSTRAINT "ship_paints_ship_uuid_env_fkey" FOREIGN KEY ("ship_uuid", "env") REFERENCES "game"."ships"("uuid", "env") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game"."shop_inventory" ADD CONSTRAINT "shop_inventory_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "game"."shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game"."commodity_prices" ADD CONSTRAINT "commodity_prices_commodity_uuid_commodity_env_fkey" FOREIGN KEY ("commodity_uuid", "commodity_env") REFERENCES "game"."commodities"("uuid", "env") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game"."commodity_prices" ADD CONSTRAINT "commodity_prices_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "game"."shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game"."mining_composition_parts" ADD CONSTRAINT "mining_composition_parts_composition_uuid_composition_env_fkey" FOREIGN KEY ("composition_uuid", "composition_env") REFERENCES "game"."mining_compositions"("uuid", "env") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game"."mining_composition_parts" ADD CONSTRAINT "mining_composition_parts_element_uuid_element_env_fkey" FOREIGN KEY ("element_uuid", "element_env") REFERENCES "game"."mining_elements"("uuid", "env") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game"."missions" ADD CONSTRAINT "missions_blueprint_reward_uuid_blueprint_reward_env_fkey" FOREIGN KEY ("blueprint_reward_uuid", "blueprint_reward_env") REFERENCES "game"."crafting_recipes"("uuid", "env") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game"."mission_blueprint_rewards" ADD CONSTRAINT "mission_blueprint_rewards_mission_uuid_mission_env_fkey" FOREIGN KEY ("mission_uuid", "mission_env") REFERENCES "game"."missions"("uuid", "env") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game"."mission_blueprint_rewards" ADD CONSTRAINT "mission_blueprint_rewards_blueprint_uuid_blueprint_env_fkey" FOREIGN KEY ("blueprint_uuid", "blueprint_env") REFERENCES "game"."crafting_recipes"("uuid", "env") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game"."crafting_ingredients" ADD CONSTRAINT "crafting_ingredients_recipe_uuid_recipe_env_fkey" FOREIGN KEY ("recipe_uuid", "recipe_env") REFERENCES "game"."crafting_recipes"("uuid", "env") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game"."crafting_slot_modifiers" ADD CONSTRAINT "crafting_slot_modifiers_recipe_uuid_recipe_env_fkey" FOREIGN KEY ("recipe_uuid", "recipe_env") REFERENCES "game"."crafting_recipes"("uuid", "env") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game"."locations" ADD CONSTRAINT "locations_rsi_starmap_location_id_fkey" FOREIGN KEY ("rsi_starmap_location_id") REFERENCES "rsi"."starmap_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

