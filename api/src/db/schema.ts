/**
 * STARVIS — Drizzle ORM schema definitions
 * Source of truth for table structure & TypeScript types.
 *
 * Usage:
 *   import { ships, components, ... } from '@/db/schema';
 *   const result = await db.select().from(ships).where(eq(ships.uuid, id));
 *
 * Migrations:
 *   npm run db:generate   → generates SQL diff in db/migrations/
 *   npm run db:migrate    → applies pending SQL migrations
 *   npm run db:studio     → opens Drizzle Studio
 */

import {
  boolean,
  char,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

// ─── ship_matrix ────────────────────────────────────────────────────────────

export const shipMatrix = mysqlTable(
  'ship_matrix',
  {
    id: int('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    chassisId: int('chassis_id'),
    manufacturerId: int('manufacturer_id'),
    manufacturerCode: varchar('manufacturer_code', { length: 10 }),
    manufacturerName: varchar('manufacturer_name', { length: 100 }),
    focus: varchar('focus', { length: 255 }),
    type: varchar('type', { length: 50 }),
    description: text('description'),
    productionStatus: varchar('production_status', { length: 50 }),
    productionNote: text('production_note'),
    size: varchar('size', { length: 20 }),
    url: varchar('url', { length: 500 }),
    length: decimal('length', { precision: 10, scale: 2 }),
    beam: decimal('beam', { precision: 10, scale: 2 }),
    height: decimal('height', { precision: 10, scale: 2 }),
    mass: int('mass'),
    cargocapacity: int('cargocapacity'),
    minCrew: int('min_crew').default(1),
    maxCrew: int('max_crew').default(1),
    scmSpeed: int('scm_speed'),
    afterburnerSpeed: int('afterburner_speed'),
    pitchMax: decimal('pitch_max', { precision: 10, scale: 2 }),
    yawMax: decimal('yaw_max', { precision: 10, scale: 2 }),
    rollMax: decimal('roll_max', { precision: 10, scale: 2 }),
    xaxisAcceleration: decimal('xaxis_acceleration', { precision: 10, scale: 4 }),
    yaxisAcceleration: decimal('yaxis_acceleration', { precision: 10, scale: 4 }),
    zaxisAcceleration: decimal('zaxis_acceleration', { precision: 10, scale: 4 }),
    mediaSourceUrl: text('media_source_url'),
    mediaStoreSmall: text('media_store_small'),
    mediaStoreLarge: text('media_store_large'),
    compiled: json('compiled'),
    timeModified: varchar('time_modified', { length: 100 }),
    timeModifiedUnfiltered: timestamp('time_modified_unfiltered'),
    syncedAt: timestamp('synced_at').defaultNow(),
  },
  (t) => [
    index('idx_name').on(t.name),
    index('idx_manufacturer_code').on(t.manufacturerCode),
    index('idx_production_status').on(t.productionStatus),
    index('idx_chassis_id').on(t.chassisId),
    index('idx_size').on(t.size),
    index('idx_type').on(t.type),
  ],
);

// ─── manufacturers ───────────────────────────────────────────────────────────

export const manufacturers = mysqlTable(
  'manufacturers',
  {
    code: varchar('code', { length: 10 }).primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    knownFor: varchar('known_for', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [index('idx_name').on(t.name)],
);

// ─── ships ───────────────────────────────────────────────────────────────────

export const ships = mysqlTable(
  'ships',
  {
    uuid: char('uuid', { length: 36 }).primaryKey(),
    className: varchar('class_name', { length: 255 }).notNull(),

    // Identity
    name: varchar('name', { length: 255 }),
    manufacturerCode: varchar('manufacturer_code', { length: 10 }),

    // Vehicle params
    role: varchar('role', { length: 100 }),
    career: varchar('career', { length: 100 }),
    dogFightEnabled: boolean('dog_fight_enabled').default(true),
    crewSize: int('crew_size').default(1),
    vehicleDefinition: varchar('vehicle_definition', { length: 255 }),

    // Dimensions
    sizeX: decimal('size_x', { precision: 10, scale: 2 }),
    sizeY: decimal('size_y', { precision: 10, scale: 2 }),
    sizeZ: decimal('size_z', { precision: 10, scale: 2 }),
    mass: decimal('mass', { precision: 15, scale: 2 }),

    // Flight
    scmSpeed: int('scm_speed'),
    maxSpeed: int('max_speed'),
    boostSpeedForward: int('boost_speed_forward'),
    boostSpeedBackward: int('boost_speed_backward'),
    pitchMax: decimal('pitch_max', { precision: 8, scale: 2 }),
    yawMax: decimal('yaw_max', { precision: 8, scale: 2 }),
    rollMax: decimal('roll_max', { precision: 8, scale: 2 }),

    // Hull
    totalHp: int('total_hp'),
    hydrogenFuelCapacity: decimal('hydrogen_fuel_capacity', { precision: 10, scale: 2 }),
    quantumFuelCapacity: decimal('quantum_fuel_capacity', { precision: 10, scale: 2 }),
    shieldHp: int('shield_hp'),

    // Armor damage multipliers
    armorPhysical: decimal('armor_physical', { precision: 10, scale: 6 }),
    armorEnergy: decimal('armor_energy', { precision: 10, scale: 6 }),
    armorDistortion: decimal('armor_distortion', { precision: 10, scale: 6 }),
    armorThermal: decimal('armor_thermal', { precision: 10, scale: 6 }),
    armorBiochemical: decimal('armor_biochemical', { precision: 10, scale: 6 }),
    armorStun: decimal('armor_stun', { precision: 10, scale: 6 }),
    armorSignalIr: decimal('armor_signal_ir', { precision: 10, scale: 6 }),
    armorSignalEm: decimal('armor_signal_em', { precision: 10, scale: 6 }),
    armorSignalCs: decimal('armor_signal_cs', { precision: 10, scale: 6 }),

    // Armor combat stats
    armorHp: decimal('armor_hp', { precision: 10, scale: 2 }),
    armorPhysResist: decimal('armor_phys_resist', { precision: 10, scale: 6 }),
    armorEnergyResist: decimal('armor_energy_resist', { precision: 10, scale: 6 }),
    fusePenetration: decimal('fuse_penetration', { precision: 10, scale: 4 }),
    componentPenetration: decimal('component_penetration', { precision: 10, scale: 4 }),
    boostRampUp: decimal('boost_ramp_up', { precision: 8, scale: 2 }),
    boostRampDown: decimal('boost_ramp_down', { precision: 8, scale: 2 }),

    // Cross-section
    crossSectionX: decimal('cross_section_x', { precision: 10, scale: 2 }),
    crossSectionY: decimal('cross_section_y', { precision: 10, scale: 2 }),
    crossSectionZ: decimal('cross_section_z', { precision: 10, scale: 2 }),

    // Metadata
    shortName: varchar('short_name', { length: 255 }),
    description: text('description'),
    shipGrade: varchar('ship_grade', { length: 10 }),
    cargoCapacity: decimal('cargo_capacity', { precision: 10, scale: 2 }),
    missileDamageTotal: decimal('missile_damage_total', { precision: 10, scale: 2 }),
    weaponDamageTotal: decimal('weapon_damage_total', { precision: 10, scale: 2 }),
    variantType: varchar('variant_type', { length: 20 }),
    vehicleCategory: varchar('vehicle_category', { length: 20 }).default('ship'),

    // Insurance
    insuranceClaimTime: decimal('insurance_claim_time', { precision: 10, scale: 2 }),
    insuranceExpediteCost: decimal('insurance_expedite_cost', { precision: 10, scale: 2 }),

    // JSON blob
    gameData: json('game_data'),

    // Ship Matrix FK
    shipMatrixId: int('ship_matrix_id'),
    extractedAt: timestamp('extracted_at').defaultNow(),
  },
  (t) => [
    index('idx_class_name').on(t.className),
    index('idx_name').on(t.name),
    index('idx_manufacturer').on(t.manufacturerCode),
    index('idx_ship_matrix').on(t.shipMatrixId),
    index('idx_role').on(t.role),
    index('idx_career').on(t.career),
    index('idx_vehicle_category').on(t.vehicleCategory),
  ],
);

// ─── components ──────────────────────────────────────────────────────────────

export const components = mysqlTable(
  'components',
  {
    uuid: char('uuid', { length: 36 }).primaryKey(),
    className: varchar('class_name', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    subType: varchar('sub_type', { length: 100 }),
    size: tinyint('size', { unsigned: true }),
    grade: varchar('grade', { length: 10 }),
    manufacturerCode: varchar('manufacturer_code', { length: 10 }),

    // Base
    mass: decimal('mass', { precision: 10, scale: 2 }),
    hp: int('hp'),

    // Power
    powerDraw: decimal('power_draw', { precision: 10, scale: 2 }),
    powerBase: decimal('power_base', { precision: 10, scale: 2 }),
    powerOutput: decimal('power_output', { precision: 10, scale: 2 }),

    // Thermal
    heatGeneration: decimal('heat_generation', { precision: 10, scale: 2 }),
    coolingRate: decimal('cooling_rate', { precision: 15, scale: 2 }),

    // Signatures
    emSignature: decimal('em_signature', { precision: 10, scale: 2 }),
    irSignature: decimal('ir_signature', { precision: 10, scale: 2 }),

    // Weapon
    weaponDamage: decimal('weapon_damage', { precision: 10, scale: 4 }),
    weaponDamageType: varchar('weapon_damage_type', { length: 50 }),
    weaponFireRate: decimal('weapon_fire_rate', { precision: 10, scale: 4 }),
    weaponRange: decimal('weapon_range', { precision: 10, scale: 2 }),
    weaponSpeed: decimal('weapon_speed', { precision: 10, scale: 2 }),
    weaponAmmoCount: int('weapon_ammo_count'),
    weaponPelletsPerShot: tinyint('weapon_pellets_per_shot', { unsigned: true }).default(1),
    weaponBurstSize: tinyint('weapon_burst_size', { unsigned: true }),
    weaponAlphaDamage: decimal('weapon_alpha_damage', { precision: 10, scale: 4 }),
    weaponDps: decimal('weapon_dps', { precision: 10, scale: 4 }),
    weaponDamagePhysical: decimal('weapon_damage_physical', { precision: 10, scale: 4 }),
    weaponDamageEnergy: decimal('weapon_damage_energy', { precision: 10, scale: 4 }),
    weaponDamageDistortion: decimal('weapon_damage_distortion', { precision: 10, scale: 4 }),
    weaponDamageThermal: decimal('weapon_damage_thermal', { precision: 10, scale: 4 }),
    weaponDamageBiochemical: decimal('weapon_damage_biochemical', { precision: 10, scale: 4 }),
    weaponDamageStun: decimal('weapon_damage_stun', { precision: 10, scale: 4 }),
    weaponHeatPerShot: decimal('weapon_heat_per_shot', { precision: 10, scale: 5 }),
    weaponBurstDps: decimal('weapon_burst_dps', { precision: 10, scale: 4 }),
    weaponSustainedDps: decimal('weapon_sustained_dps', { precision: 10, scale: 4 }),

    // Shield
    shieldHp: decimal('shield_hp', { precision: 15, scale: 2 }),
    shieldRegen: decimal('shield_regen', { precision: 10, scale: 4 }),
    shieldRegenDelay: decimal('shield_regen_delay', { precision: 10, scale: 2 }),
    shieldHardening: decimal('shield_hardening', { precision: 10, scale: 4 }),
    shieldFaces: tinyint('shield_faces', { unsigned: true }),

    // Quantum drive
    qdSpeed: decimal('qd_speed', { precision: 15, scale: 2 }),
    qdSpoolTime: decimal('qd_spool_time', { precision: 10, scale: 2 }),
    qdCooldown: decimal('qd_cooldown', { precision: 10, scale: 2 }),
    qdFuelRate: decimal('qd_fuel_rate', { precision: 10, scale: 6 }),
    qdRange: decimal('qd_range', { precision: 15, scale: 2 }),
    qdStage1Accel: decimal('qd_stage1_accel', { precision: 15, scale: 2 }),
    qdStage2Accel: decimal('qd_stage2_accel', { precision: 15, scale: 2 }),
    qdTuningRate: decimal('qd_tuning_rate', { precision: 10, scale: 4 }),
    qdAlignmentRate: decimal('qd_alignment_rate', { precision: 10, scale: 4 }),
    qdDisconnectRange: decimal('qd_disconnect_range', { precision: 15, scale: 2 }),

    // Missile
    missileDamage: decimal('missile_damage', { precision: 10, scale: 2 }),
    missileSignalType: varchar('missile_signal_type', { length: 20 }),
    missileLockTime: decimal('missile_lock_time', { precision: 10, scale: 2 }),
    missileSpeed: decimal('missile_speed', { precision: 10, scale: 2 }),
    missileRange: decimal('missile_range', { precision: 10, scale: 2 }),
    missileLockRange: decimal('missile_lock_range', { precision: 10, scale: 2 }),
    missileDamagePhysical: decimal('missile_damage_physical', { precision: 10, scale: 2 }),
    missileDamageEnergy: decimal('missile_damage_energy', { precision: 10, scale: 2 }),
    missileDamageDistortion: decimal('missile_damage_distortion', { precision: 10, scale: 2 }),

    // Thruster
    thrusterMaxThrust: decimal('thruster_max_thrust', { precision: 15, scale: 2 }),
    thrusterType: varchar('thruster_type', { length: 50 }),

    // Radar
    radarRange: decimal('radar_range', { precision: 15, scale: 2 }),
    radarDetectionLifetime: decimal('radar_detection_lifetime', { precision: 10, scale: 2 }),
    radarTrackingSignal: decimal('radar_tracking_signal', { precision: 10, scale: 4 }),

    // Misc
    cmAmmoCount: int('cm_ammo_count'),
    fuelCapacity: decimal('fuel_capacity', { precision: 10, scale: 2 }),
    fuelIntakeRate: decimal('fuel_intake_rate', { precision: 10, scale: 4 }),
    empDamage: decimal('emp_damage', { precision: 10, scale: 2 }),
    empRadius: decimal('emp_radius', { precision: 10, scale: 2 }),
    empChargeTime: decimal('emp_charge_time', { precision: 10, scale: 2 }),
    empCooldown: decimal('emp_cooldown', { precision: 10, scale: 2 }),
    qigJammerRange: decimal('qig_jammer_range', { precision: 15, scale: 2 }),
    qigSnareRadius: decimal('qig_snare_radius', { precision: 15, scale: 2 }),
    qigChargeTime: decimal('qig_charge_time', { precision: 10, scale: 2 }),
    qigCooldown: decimal('qig_cooldown', { precision: 10, scale: 2 }),
    miningSpeed: decimal('mining_speed', { precision: 10, scale: 4 }),
    miningRange: decimal('mining_range', { precision: 10, scale: 2 }),
    miningResistance: decimal('mining_resistance', { precision: 10, scale: 4 }),
    miningInstability: decimal('mining_instability', { precision: 10, scale: 4 }),
    tractorMaxForce: decimal('tractor_max_force', { precision: 15, scale: 2 }),
    tractorMaxRange: decimal('tractor_max_range', { precision: 10, scale: 2 }),
    salvageSpeed: decimal('salvage_speed', { precision: 10, scale: 4 }),
    salvageRadius: decimal('salvage_radius', { precision: 10, scale: 2 }),
    gimbalType: varchar('gimbal_type', { length: 20 }),
    rackCount: tinyint('rack_count', { unsigned: true }),
    rackMissileSize: tinyint('rack_missile_size', { unsigned: true }),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    index('idx_type').on(t.type),
    index('idx_sub_type').on(t.subType),
    index('idx_size').on(t.size),
    index('idx_grade').on(t.grade),
    index('idx_manufacturer').on(t.manufacturerCode),
    index('idx_class_name').on(t.className),
    index('idx_type_size').on(t.type, t.size),
  ],
);

// ─── ships_loadouts ──────────────────────────────────────────────────────────

export const shipsLoadouts = mysqlTable(
  'ships_loadouts',
  {
    id: int('id').autoincrement().primaryKey(),
    shipUuid: char('ship_uuid', { length: 36 }).notNull(),
    portName: varchar('port_name', { length: 100 }).notNull(),
    portDisplayName: varchar('port_display_name', { length: 100 }),
    portMinSize: tinyint('port_min_size', { unsigned: true }),
    portMaxSize: tinyint('port_max_size', { unsigned: true }),
    portEditable: boolean('port_editable').default(true),
    componentClassName: varchar('component_class_name', { length: 255 }),
    componentUuid: char('component_uuid', { length: 36 }),
    portType: varchar('port_type', { length: 50 }),
    parentId: int('parent_id'),
  },
  (t) => [
    index('idx_ship').on(t.shipUuid),
    index('idx_port_type').on(t.portType),
    index('idx_component').on(t.componentUuid),
    index('idx_parent').on(t.parentId),
  ],
);

// ─── ship_modules ─────────────────────────────────────────────────────────────

export const shipModules = mysqlTable(
  'ship_modules',
  {
    id: int('id').autoincrement().primaryKey(),
    shipUuid: char('ship_uuid', { length: 36 }).notNull(),
    slotName: varchar('slot_name', { length: 100 }).notNull(),
    slotDisplayName: varchar('slot_display_name', { length: 100 }),
    slotType: varchar('slot_type', { length: 20 }),
    moduleClassName: varchar('module_class_name', { length: 255 }).notNull(),
    moduleName: varchar('module_name', { length: 255 }),
    moduleUuid: char('module_uuid', { length: 36 }),
    moduleTier: tinyint('module_tier', { unsigned: true }),
    isDefault: boolean('is_default').default(false),
    loadoutJson: json('loadout_json'),
  },
  (t) => [index('idx_ship').on(t.shipUuid), index('idx_module_class').on(t.moduleClassName)],
);

// ─── ship_paints ─────────────────────────────────────────────────────────────

export const shipPaints = mysqlTable(
  'ship_paints',
  {
    id: int('id').autoincrement().primaryKey(),
    shipUuid: char('ship_uuid', { length: 36 }).notNull(),
    paintClassName: varchar('paint_class_name', { length: 255 }).notNull(),
    paintName: varchar('paint_name', { length: 255 }),
    paintUuid: char('paint_uuid', { length: 36 }),
  },
  (t) => [index('idx_ship').on(t.shipUuid), index('idx_paint_class').on(t.paintClassName)],
);

// ─── extraction_log ──────────────────────────────────────────────────────────

export const extractionLog = mysqlTable(
  'extraction_log',
  {
    id: int('id').autoincrement().primaryKey(),
    extractionHash: char('extraction_hash', { length: 64 }).notNull(),
    gameVersion: varchar('game_version', { length: 50 }),
    shipsCount: int('ships_count').default(0),
    componentsCount: int('components_count').default(0),
    itemsCount: int('items_count').default(0),
    commoditiesCount: int('commodities_count').default(0),
    manufacturersCount: int('manufacturers_count').default(0),
    loadoutPortsCount: int('loadout_ports_count').default(0),
    shopsCount: int('shops_count').default(0),
    durationMs: int('duration_ms'),
    status: mysqlEnum('status', ['success', 'partial', 'failed']).default('success'),
    errorMessage: text('error_message'),
    extractedAt: timestamp('extracted_at').defaultNow(),
  },
  (t) => [index('idx_hash').on(t.extractionHash), index('idx_extracted_at').on(t.extractedAt)],
);

// ─── changelog ───────────────────────────────────────────────────────────────

export const changelog = mysqlTable(
  'changelog',
  {
    id: int('id').autoincrement().primaryKey(),
    extractionId: int('extraction_id').notNull(),
    entityType: mysqlEnum('entity_type', ['ship', 'component', 'item', 'commodity', 'shop', 'module']).notNull(),
    entityUuid: varchar('entity_uuid', { length: 255 }).notNull(),
    entityName: varchar('entity_name', { length: 255 }),
    changeType: mysqlEnum('change_type', ['added', 'removed', 'modified']).notNull(),
    fieldName: varchar('field_name', { length: 100 }),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [
    index('idx_extraction').on(t.extractionId),
    index('idx_entity_type').on(t.entityType),
    index('idx_change_type').on(t.changeType),
    index('idx_created').on(t.createdAt),
  ],
);

// ─── shops ───────────────────────────────────────────────────────────────────

export const shops = mysqlTable(
  'shops',
  {
    id: int('id').autoincrement().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    location: varchar('location', { length: 255 }),
    parentLocation: varchar('parent_location', { length: 255 }),
    system: varchar('system', { length: 50 }),
    planetMoon: varchar('planet_moon', { length: 100 }),
    city: varchar('city', { length: 100 }),
    shopType: varchar('shop_type', { length: 50 }),
    className: varchar('class_name', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    index('idx_location').on(t.location),
    index('idx_type').on(t.shopType),
    index('idx_system').on(t.system),
    index('idx_city').on(t.city),
    uniqueIndex('uk_class_name').on(t.className),
  ],
);

// ─── shop_inventory ──────────────────────────────────────────────────────────

export const shopInventory = mysqlTable(
  'shop_inventory',
  {
    id: int('id').autoincrement().primaryKey(),
    shopId: int('shop_id').notNull(),
    componentUuid: char('component_uuid', { length: 36 }),
    itemUuid: char('item_uuid', { length: 36 }),
    componentClassName: varchar('component_class_name', { length: 255 }).notNull(),
    basePrice: decimal('base_price', { precision: 12, scale: 2 }),
    rentalPrice1d: decimal('rental_price_1d', { precision: 12, scale: 2 }),
    rentalPrice3d: decimal('rental_price_3d', { precision: 12, scale: 2 }),
    rentalPrice7d: decimal('rental_price_7d', { precision: 12, scale: 2 }),
    rentalPrice30d: decimal('rental_price_30d', { precision: 12, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    index('idx_shop').on(t.shopId),
    index('idx_component').on(t.componentUuid),
    index('idx_item').on(t.itemUuid),
    index('idx_class_name').on(t.componentClassName),
  ],
);

// ─── Inferred TypeScript types ───────────────────────────────────────────────

export type ShipMatrix = typeof shipMatrix.$inferSelect;
export type InsertShipMatrix = typeof shipMatrix.$inferInsert;

export type Manufacturer = typeof manufacturers.$inferSelect;
export type InsertManufacturer = typeof manufacturers.$inferInsert;

export type Ship = typeof ships.$inferSelect;
export type InsertShip = typeof ships.$inferInsert;

export type Component = typeof components.$inferSelect;
export type InsertComponent = typeof components.$inferInsert;

export type ShipLoadout = typeof shipsLoadouts.$inferSelect;
export type InsertShipLoadout = typeof shipsLoadouts.$inferInsert;

export type ShipModule = typeof shipModules.$inferSelect;
export type InsertShipModule = typeof shipModules.$inferInsert;

export type ShipPaint = typeof shipPaints.$inferSelect;
export type InsertShipPaint = typeof shipPaints.$inferInsert;

export type ExtractionLog = typeof extractionLog.$inferSelect;
export type InsertExtractionLog = typeof extractionLog.$inferInsert;

export type Changelog = typeof changelog.$inferSelect;
export type InsertChangelog = typeof changelog.$inferInsert;

export type Shop = typeof shops.$inferSelect;
export type InsertShop = typeof shops.$inferInsert;
