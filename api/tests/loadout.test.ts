/**
 * STARVIS - Loadout Simulator Unit Tests
 * Tests aggregateLoadoutStats() — the pure stat-aggregation logic.
 *
 * Uses mock Row data (no DB required).
 */
import { describe, expect, it } from "vitest";
import { LoadoutService } from "../src/services/loadout-service.js";
import type { Row } from "../src/services/shared.js";

// ── Helpers ──────────────────────────────────────────────

/** Create a minimal ship Row with sensible defaults */
function mockShip(overrides: Record<string, unknown> = {}): Row {
  return {
    uuid: "ship-001", name: "Aurora MR", class_name: "RSI_Aurora_MR",
    total_hp: 5000, mass: 25000,
    scm_speed: 210, max_speed: 1235,
    boost_speed_forward: 800, boost_speed_backward: 200,
    pitch_max: 65, yaw_max: 65, roll_max: 130,
    hydrogen_fuel_capacity: 20000, quantum_fuel_capacity: 583,
    armor_physical: 0.5, armor_energy: 0.6, armor_distortion: 0.8, armor_thermal: 0.7,
    armor_signal_ir: 4200, armor_signal_em: 3100, armor_signal_cs: 1800,
    cross_section_x: 12.5, cross_section_y: 6.0, cross_section_z: 18.0,
    ship_matrix_id: 1, display_name: "Aurora MR",
    ...overrides,
    constructor: { name: "RowDataPacket" },
  } as unknown as Row;
}

/** Create a loadout row for a weapon */
function mockWeapon(overrides: Record<string, unknown> = {}): Row {
  return {
    id: 1, port_name: "hardpoint_weapon_gun_01", port_type: "WeaponGun",
    component_uuid: "comp-w1", component_class_name: "KLWE_LaserRepeater_S3",
    type: "WeaponGun", name: "CF-337 Panther Repeater",
    size: 3, grade: "A", manufacturer_code: "KLWE",
    weapon_dps: 280, weapon_burst_dps: 310, weapon_sustained_dps: 250,
    weapon_damage: 42, weapon_fire_rate: 6.67, weapon_range: 3600,
    weapon_damage_physical: 0, weapon_damage_energy: 42, weapon_damage_distortion: 0,
    power_draw: 3.5, heat_generation: 2.8,
    ...overrides,
    constructor: { name: "RowDataPacket" },
  } as unknown as Row;
}

/** Create a loadout row for a shield */
function mockShield(overrides: Record<string, unknown> = {}): Row {
  return {
    id: 10, port_name: "hardpoint_shield_01", port_type: "Shield",
    component_uuid: "comp-s1", component_class_name: "GAMA_Shield_S2",
    type: "Shield", name: "S02 FR-66 Shield",
    size: 2, grade: "A", manufacturer_code: "GAMA",
    shield_hp: 5500, shield_regen: 55, shield_regen_delay: 6.5,
    shield_hardening: 0.85,
    power_draw: 4.2, heat_generation: 3.0,
    ...overrides,
    constructor: { name: "RowDataPacket" },
  } as unknown as Row;
}

/** Create a loadout row for a power plant */
function mockPowerPlant(overrides: Record<string, unknown> = {}): Row {
  return {
    id: 20, port_name: "hardpoint_power_plant_01", port_type: "PowerPlant",
    component_uuid: "comp-pp1", component_class_name: "AEGS_PowerPlant_S2",
    type: "PowerPlant", name: "S02 Regulus Power Plant",
    size: 2, grade: "B", manufacturer_code: "AEGS",
    power_output: 4500,
    power_draw: 0, heat_generation: 5.0,
    ...overrides,
    constructor: { name: "RowDataPacket" },
  } as unknown as Row;
}

/** Create a loadout row for a cooler */
function mockCooler(overrides: Record<string, unknown> = {}): Row {
  return {
    id: 30, port_name: "hardpoint_cooler_01", port_type: "Cooler",
    component_uuid: "comp-c1", component_class_name: "AEGS_Cooler_S2",
    type: "Cooler", name: "S02 NDB-30 Cooler",
    size: 2, grade: "B", manufacturer_code: "AEGS",
    cooling_rate: 280000,
    power_draw: 1.5, heat_generation: 0,
    ...overrides,
    constructor: { name: "RowDataPacket" },
  } as unknown as Row;
}

/** Create a loadout row for a quantum drive */
function mockQD(overrides: Record<string, unknown> = {}): Row {
  return {
    id: 40, port_name: "hardpoint_quantum_drive_01", port_type: "QuantumDrive",
    component_uuid: "comp-qd1", component_class_name: "AEGS_QuantumDrive_S1",
    type: "QuantumDrive", name: "S01 Expedition Quantum Drive",
    size: 1, grade: "A", manufacturer_code: "AEGS",
    qd_speed: 77000000, qd_spool_time: 5.2, qd_cooldown: 4.0,
    qd_fuel_rate: 0.0085, qd_range: 1.2e8,
    qd_tuning_rate: 0.2, qd_alignment_rate: 0.15, qd_disconnect_range: 500,
    power_draw: 2.0, heat_generation: 1.5,
    ...overrides,
    constructor: { name: "RowDataPacket" },
  } as unknown as Row;
}

/** Create a loadout row for a missile */
function mockMissile(overrides: Record<string, unknown> = {}): Row {
  return {
    id: 50, port_name: "hardpoint_missile_01", port_type: "Missile",
    component_uuid: "comp-m1", component_class_name: "BEHR_Missile_S2",
    type: "Missile", name: "S02 Dominator II Missile",
    size: 2, missile_damage: 3200, missile_speed: 1100,
    missile_range: 5000, missile_lock_time: 2.5,
    missile_signal_type: "IR",
    missile_damage_physical: 2200, missile_damage_energy: 1000, missile_damage_distortion: 0,
    power_draw: 0, heat_generation: 0,
    ...overrides,
    constructor: { name: "RowDataPacket" },
  } as unknown as Row;
}

/** Create a loadout row for a countermeasure */
function mockCM(overrides: Record<string, unknown> = {}): Row {
  return {
    id: 60, port_name: "hardpoint_cm_01", port_type: "Countermeasure",
    component_uuid: "comp-cm1",
    type: "Countermeasure", name: "CML Flare Launcher",
    cm_ammo_count: 24,
    power_draw: 0.5, heat_generation: 0.3,
    ...overrides,
    constructor: { name: "RowDataPacket" },
  } as unknown as Row;
}

// We instantiate with null pool — aggregateLoadoutStats() is pure
const service = new LoadoutService(null as any);

// ── Tests ────────────────────────────────────────────────

describe("aggregateLoadoutStats", () => {
  const ship = mockShip();

  describe("Empty loadout", () => {
    it("returns zeroed stats with empty loadout", () => {
      const stats = service.aggregateLoadoutStats([], ship, 12, 6, 18);
      expect(stats.weapons).toMatchObject({ count: 0, total_dps: 0, details: [] });
      expect(stats.shields).toMatchObject({ count: 0, total_hp: 0, total_regen: 0, details: [] });
      expect(stats.missiles).toMatchObject({ count: 0, total_damage: 0, details: [] });
      expect(stats.power).toMatchObject({ total_draw: 0, total_output: 0, balance: 0 });
      expect(stats.thermal).toMatchObject({ total_heat_generation: 0, total_cooling_rate: 0, balance: 0 });
    });

    it("still includes ship hull/armor/mobility/fuel data", () => {
      const stats = service.aggregateLoadoutStats([], ship, 12, 6, 18) as any;
      expect(stats.hull.total_hp).toBe(5000);
      expect(stats.armor.physical).toBe(0.5);
      expect(stats.mobility.scm_speed).toBe(210);
      expect(stats.fuel.hydrogen).toBe(20000);
      expect(stats.signatures.ir).toBe(4200);
    });
  });

  describe("Single weapon", () => {
    it("aggregates weapon DPS", () => {
      const loadout = [mockWeapon()];
      const stats = service.aggregateLoadoutStats(loadout, ship, 12, 6, 18) as any;
      expect(stats.weapons.count).toBe(1);
      expect(stats.weapons.total_dps).toBe(280);
      expect(stats.weapons.total_burst_dps).toBe(310);
      expect(stats.weapons.total_sustained_dps).toBe(250);
      expect(stats.weapons.details).toHaveLength(1);
      expect(stats.weapons.details[0].name).toContain("Panther");
    });
  });

  describe("Multiple weapons", () => {
    it("sums DPS across all weapons", () => {
      const loadout = [
        mockWeapon({ port_name: "gun_01", weapon_dps: 280 }),
        mockWeapon({ id: 2, port_name: "gun_02", weapon_dps: 280, component_uuid: "comp-w2" }),
        mockWeapon({ id: 3, port_name: "gun_03", weapon_dps: 150, component_uuid: "comp-w3", size: 2 }),
      ];
      const stats = service.aggregateLoadoutStats(loadout, ship, 12, 6, 18) as any;
      expect(stats.weapons.count).toBe(3);
      expect(stats.weapons.total_dps).toBe(710);
    });
  });

  describe("Shields", () => {
    it("aggregates shield HP and regen", () => {
      const loadout = [
        mockShield({ shield_hp: 5500, shield_regen: 55 }),
        mockShield({ id: 11, port_name: "shield_02", shield_hp: 5500, shield_regen: 55, component_uuid: "comp-s2" }),
      ];
      const stats = service.aggregateLoadoutStats(loadout, ship, 12, 6, 18) as any;
      expect(stats.shields.count).toBe(2);
      expect(stats.shields.total_hp).toBe(11000);
      expect(stats.shields.total_regen).toBe(110);
      expect(stats.shields.time_to_charge).toBe(100); // 11000/110 = 100
    });
  });

  describe("Power balance", () => {
    it("calculates power draw vs output balance", () => {
      const loadout = [
        mockPowerPlant({ power_output: 4500 }),
        mockWeapon({ power_draw: 3.5, weapon_dps: 200 }),
        mockShield({ power_draw: 4.2 }),
      ];
      const stats = service.aggregateLoadoutStats(loadout, ship, 12, 6, 18) as any;
      expect(stats.power.total_output).toBe(4500);
      expect(stats.power.total_draw).toBeCloseTo(7.7, 1);
      expect(stats.power.balance).toBeCloseTo(4500 - 7.7, 1);
    });
  });

  describe("Thermal balance", () => {
    it("calculates heat generation vs cooling rate", () => {
      const loadout = [
        mockCooler({ cooling_rate: 280000 }),
        mockWeapon({ heat_generation: 2.8, weapon_dps: 200 }),
      ];
      const stats = service.aggregateLoadoutStats(loadout, ship, 12, 6, 18) as any;
      expect(stats.thermal.total_cooling_rate).toBe(280000);
      expect(stats.thermal.total_heat_generation).toBeCloseTo(2.8, 1);
      expect(stats.thermal.balance).toBeGreaterThan(0);
    });
  });

  describe("Quantum drive", () => {
    it("populates quantum stats from drive", () => {
      const loadout = [mockQD()];
      const stats = service.aggregateLoadoutStats(loadout, ship, 12, 6, 18) as any;
      expect(stats.quantum.speed).toBe(77000000);
      expect(stats.quantum.spool_time).toBe(5.2);
      expect(stats.quantum.cooldown).toBe(4.0);
      expect(stats.quantum.fuel_rate).toBe(0.0085);
      expect(stats.quantum.fuel_capacity).toBe(583);
    });
  });

  describe("Missiles", () => {
    it("aggregates missile count and damage", () => {
      const loadout = [
        mockMissile({ missile_damage: 3200 }),
        mockMissile({ id: 51, port_name: "missile_02", missile_damage: 4800, component_uuid: "comp-m2" }),
      ];
      const stats = service.aggregateLoadoutStats(loadout, ship, 12, 6, 18) as any;
      expect(stats.missiles.count).toBe(2);
      expect(stats.missiles.total_damage).toBe(8000);
      expect(stats.missiles.details).toHaveLength(2);
    });
  });

  describe("Countermeasures", () => {
    it("separates flares and chaff counts", () => {
      const loadout = [
        mockCM({ name: "CML Flare Launcher", cm_ammo_count: 24 }),
        mockCM({ id: 61, port_name: "cm_02", name: "CML Chaff Dispenser", cm_ammo_count: 24, component_uuid: "comp-cm2" }),
      ];
      const stats = service.aggregateLoadoutStats(loadout, ship, 12, 6, 18) as any;
      expect(stats.countermeasures.flare_count).toBe(24);
      expect(stats.countermeasures.chaff_count).toBe(24);
      expect(stats.countermeasures.details).toHaveLength(2);
    });
  });

  describe("Utility weapons (mining/salvage/tractor)", () => {
    it("classifies mining lasers as utility", () => {
      const loadout = [
        mockWeapon({
          name: "Arbor Mining Laser MH1", class_name: "GRLN_MiningLaser_S1",
          weapon_dps: 50, weapon_damage: 15,
        }),
      ];
      const stats = service.aggregateLoadoutStats(loadout, ship, 12, 6, 18) as any;
      // Mining lasers should go to utility, NOT weapons
      expect(stats.weapons.count).toBe(0);
      expect(stats.utility.count).toBe(1);
      expect(stats.utility.details[0].utility_type).toBe("MiningLaser");
    });

    it("classifies tractor beams as utility", () => {
      const loadout = [
        mockWeapon({ name: "MaxOx Tractor", class_name: "MOOX_TractorBeam_S1", weapon_dps: 0 }),
      ];
      const stats = service.aggregateLoadoutStats(loadout, ship, 12, 6, 18) as any;
      expect(stats.utility.count).toBe(1);
      expect(stats.utility.details[0].utility_type).toBe("TractorBeam");
    });
  });

  describe("EHP calculation", () => {
    it("computes effective HP from hull + shields + armor", () => {
      const loadout = [mockShield({ shield_hp: 10000, shield_regen: 100 })];
      const testShip = mockShip({ total_hp: 5000, armor_physical: 0.5, armor_energy: 0.6 });
      const stats = service.aggregateLoadoutStats(loadout, testShip, 12, 6, 18) as any;
      // avgArmor = (0.5 + 0.6) / 2 = 0.55
      // ehp = shieldHp + hullHp / avgArmor = 10000 + 5000/0.55 ≈ 19090.91
      expect(stats.hull.ehp).toBeCloseTo(10000 + 5000 / 0.55, 0);
    });

    it("handles zero armor gracefully", () => {
      const testShip = mockShip({ total_hp: 5000, armor_physical: 0, armor_energy: 0 });
      const stats = service.aggregateLoadoutStats([], testShip, 12, 6, 18) as any;
      // avgArmor = 0, so ehp = shieldHp + hullHp (fallback, no division by zero)
      expect(stats.hull.ehp).toBe(5000);
    });
  });

  describe("Cross section from parameters", () => {
    it("uses provided cross-section values", () => {
      const stats = service.aggregateLoadoutStats([], ship, 12.5, 6.0, 18.0) as any;
      expect(stats.hull.cross_section_x).toBe(12.5);
      expect(stats.hull.cross_section_y).toBe(6.0);
      expect(stats.hull.cross_section_z).toBe(18.0);
    });
  });

  describe("Ports without component_uuid are skipped", () => {
    it("ignores empty slots (no component_uuid)", () => {
      const emptyPort = mockWeapon({ component_uuid: null, weapon_dps: 500 });
      const stats = service.aggregateLoadoutStats([emptyPort], ship, 12, 6, 18) as any;
      expect(stats.weapons.count).toBe(0);
      expect(stats.weapons.total_dps).toBe(0);
    });
  });

  describe("Full realistic loadout", () => {
    it("aggregates a complete fighter loadout correctly", () => {
      const loadout = [
        mockWeapon({ id: 1, port_name: "gun_01", weapon_dps: 280, power_draw: 3.5, heat_generation: 2.8 }),
        mockWeapon({ id: 2, port_name: "gun_02", weapon_dps: 280, power_draw: 3.5, heat_generation: 2.8, component_uuid: "comp-w2" }),
        mockShield({ id: 10, shield_hp: 5500, shield_regen: 55, power_draw: 4.2, heat_generation: 3.0 }),
        mockShield({ id: 11, port_name: "shield_02", shield_hp: 5500, shield_regen: 55, power_draw: 4.2, heat_generation: 3.0, component_uuid: "comp-s2" }),
        mockPowerPlant({ id: 20, power_output: 4500, heat_generation: 5.0 }),
        mockCooler({ id: 30, cooling_rate: 280000, power_draw: 1.5 }),
        mockQD({ id: 40, qd_speed: 77000000, power_draw: 2.0, heat_generation: 1.5 }),
        mockMissile({ id: 50, missile_damage: 3200 }),
        mockMissile({ id: 51, port_name: "missile_02", missile_damage: 3200, component_uuid: "comp-m2" }),
        mockCM({ id: 60, name: "CML Flare Launcher", cm_ammo_count: 24 }),
      ];

      const stats = service.aggregateLoadoutStats(loadout, ship, 12.5, 6.0, 18.0) as any;

      // Weapons
      expect(stats.weapons.count).toBe(2);
      expect(stats.weapons.total_dps).toBe(560);

      // Shields
      expect(stats.shields.count).toBe(2);
      expect(stats.shields.total_hp).toBe(11000);

      // Missiles
      expect(stats.missiles.count).toBe(2);
      expect(stats.missiles.total_damage).toBe(6400);

      // Power balance
      expect(stats.power.total_output).toBe(4500);
      expect(stats.power.total_draw).toBeGreaterThan(0);

      // Thermal balance
      expect(stats.thermal.total_cooling_rate).toBe(280000);

      // Quantum
      expect(stats.quantum.speed).toBe(77000000);

      // CM
      expect(stats.countermeasures.flare_count).toBe(24);
    });
  });
});
