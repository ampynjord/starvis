/**
 * Tests for classifyPort — port type classification from loadout data
 */
import { describe, expect, it } from 'vitest';
import { classifyPort } from '../src/dataforge-service.js';

describe('classifyPort', () => {
  // ── WeaponGun ──
  it.each([
    ['hardpoint_weapon_gun_01', 'KLWE_LaserRepeater_S3'],
    ['hardpoint_weapon_gun_02', 'BEHR_LaserCannon_S1'],
    ['hardpoint_weapon_wing_left', 'GATS_Gatling_S2'],
    ['turret_gun_mount', 'KLWE_LaserRepeater_S2'],
    ['weapon_gun_01', 'BEHR_Scattergun_S3'],
  ])("classifies '%s' + '%s' as WeaponGun", (port, comp) => {
    expect(classifyPort(port, comp)).toBe('WeaponGun');
  });

  // ── Gimbal ──
  it.each([
    ['hardpoint_weapon_01', 'mount_gimbal_s3'],
    ['weapon_mount', 'mount_fixed_s2'],
  ])("classifies '%s' + '%s' as Gimbal", (port, comp) => {
    expect(classifyPort(port, comp)).toBe('Gimbal');
  });

  // ── Turret ──
  it.each([
    ['turret_top', ''],
    ['hardpoint_turret_01', 'some_turret_class'],
    ['turret_bottom_remote', 'AEGS_Turret_Remote_S3'],
  ])("classifies '%s' + '%s' as Turret", (port, comp) => {
    expect(classifyPort(port, comp)).toBe('Turret');
  });

  // ── MissileRack ──
  it.each([
    ['hardpoint_missile_01', ''],
    ['pylon_left', ''],
    ['hardpoint_weapon_01', 'MRCK_S4_RACK'],
  ])("classifies '%s' + '%s' as MissileRack", (port, comp) => {
    expect(classifyPort(port, comp)).toBe('MissileRack');
  });

  // ── Shield ──
  it('classifies shield port', () => {
    expect(classifyPort('hardpoint_shield_generator_01', '')).toBe('Shield');
  });

  // ── PowerPlant ──
  it('classifies power_plant port', () => {
    expect(classifyPort('hardpoint_power_plant_01', '')).toBe('PowerPlant');
  });

  // ── Cooler ──
  it('classifies cooler port', () => {
    expect(classifyPort('hardpoint_cooler_01', '')).toBe('Cooler');
  });

  // ── QuantumDrive ──
  it('classifies quantum_drive port', () => {
    expect(classifyPort('hardpoint_quantum_drive', '')).toBe('QuantumDrive');
  });

  // ── Radar ──
  it('classifies radar port', () => {
    expect(classifyPort('hardpoint_radar', '')).toBe('Radar');
  });

  // ── Countermeasure ──
  it('classifies countermeasure port', () => {
    expect(classifyPort('hardpoint_countermeasure_01', '')).toBe('Countermeasure');
  });

  // ── FlightController ──
  it('classifies controller_flight port', () => {
    expect(classifyPort('hardpoint_controller_flight', '')).toBe('FlightController');
  });

  // ── Thruster ──
  it('classifies thruster port', () => {
    expect(classifyPort('hardpoint_thruster_main_01', '')).toBe('Thruster');
  });

  // ── EMP ──
  it.each([
    ['hardpoint_emp_device', ''],
    ['emp_generator', ''],
  ])("classifies '%s' + '%s' as EMP", (port, comp) => {
    expect(classifyPort(port, comp)).toBe('EMP');
  });

  it('port name takes priority over EMP class name on weapon port', () => {
    // hardpoint_weapon_01 → WeaponGun (port name match wins)
    expect(classifyPort('hardpoint_weapon_01', 'EMP_Device_S3')).toBe('WeaponGun');
  });

  it('does NOT classify temperature-related ports as EMP', () => {
    expect(classifyPort('temp_sensor', '')).not.toBe('EMP');
  });

  // ── QIG ──
  it.each([
    ['hardpoint_interdiction', ''],
    ['hardpoint_qig_01', ''],
  ])("classifies '%s' + '%s' as QuantumInterdictionGenerator", (port, comp) => {
    expect(classifyPort(port, comp)).toBe('QuantumInterdictionGenerator');
  });

  it('port name takes priority over QIG class name on weapon port', () => {
    expect(classifyPort('hardpoint_weapon_01', 'RSI_QuantumInterdiction_S3')).toBe('WeaponGun');
  });

  // ── WeaponRack ──
  it('classifies weapon_rack', () => {
    expect(classifyPort('weapon_rack_01', '')).toBe('WeaponRack');
  });

  // ── Other (fallback) ──
  it('classifies unknown ports as Other', () => {
    expect(classifyPort('hardpoint_seat_pilot', '')).toBe('Other');
    expect(classifyPort('dashboard_hud', '')).toBe('Other');
  });
});
