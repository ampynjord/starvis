import { describe, it, expect } from 'vitest';

// Reproduire les fonctions du calculateur pour les tester
function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round(v: number, d = 2): number {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

function getHitboxMultiplier(hitbox: 'head' | 'torso' | 'arm' | 'leg'): number {
  if (hitbox === 'head') return 1.6;
  if (hitbox === 'torso') return 1;
  if (hitbox === 'arm') return 0.85;
  return 0.75;
}

function getArmorReduction(armorClass: string): number {
  if (armorClass === 'light') return 0.25;
  if (armorClass === 'medium') return 0.4;
  if (armorClass === 'heavy') return 0.55;
  return 0.4;
}

describe('FPS Calculator - Damage Formula', () => {
  it('should calculate damage per shot with base values', () => {
    // Scenario: 30 damage weapon, single shot
    const baseDamage = 30;
    const baseRpm = 600;
    const fireRateBonus = 0;
    const damageBonus = 0;
    const hitbox = 'torso';
    const armorClass = 'light';
    const craftedMitigation = 0;

    // Apply modifiers
    const fireRateMultiplier = 1 + fireRateBonus / 100;
    const damageMultiplier = 1 + damageBonus / 100;
    const hitboxMultiplier = getHitboxMultiplier(hitbox);
    const baseReduction = getArmorReduction(armorClass);
    const mitigation = clamp(baseReduction + craftedMitigation / 100, 0, 0.9);

    const damagePerShot = baseDamage * damageMultiplier * hitboxMultiplier * (1 - mitigation);
    const effectiveRpm = baseRpm * fireRateMultiplier;
    const dps = (damagePerShot * effectiveRpm) / 60;

    expect(round(damagePerShot, 2)).toBe(22.5); // 30 * 1 * 1 * 0.75 (light armor 25% reduction)
    expect(round(dps, 2)).toBe(225); // (22.5 * 600) / 60
  });

  it('should calculate TTK correctly', () => {
    // Scenario: 25 damage weapon vs 100 HP target
    const damagePerShot = 25;
    const targetHealth = 100;
    const effectiveRpm = 600;

    const shotsToKill = Math.ceil(targetHealth / damagePerShot);
    const ttk = (shotsToKill - 1) / (effectiveRpm / 60);

    expect(shotsToKill).toBe(4);
    expect(round(ttk, 3)).toBe(0.3); // (4 - 1) / (600 / 60) = 3 / 10 = 0.3
  });

  it('should apply hitbox multipliers correctly', () => {
    const baseDamage = 40;
    const damageBonus = 0;
    const damageMultiplier = 1 + damageBonus / 100;

    // Head shot
    const headDamage = baseDamage * damageMultiplier * getHitboxMultiplier('head') * (1 - 0.4);
    expect(round(headDamage, 2)).toBe(38.4); // 40 * 1 * 1.6 * 0.6

    // Torso shot
    const torsoDamage = baseDamage * damageMultiplier * getHitboxMultiplier('torso') * (1 - 0.4);
    expect(round(torsoDamage, 2)).toBe(24); // 40 * 1 * 1 * 0.6

    // Leg shot
    const legDamage = baseDamage * damageMultiplier * getHitboxMultiplier('leg') * (1 - 0.4);
    expect(round(legDamage, 2)).toBe(18); // 40 * 1 * 0.75 * 0.6
  });

  it('should apply damage and fire rate bonuses', () => {
    const baseDamage = 30;
    const baseRpm = 600;
    const fireRateBonus = 10; // +10%
    const damageBonus = 15; // +15%
    const mitigation = 0.4;

    const fireRateMultiplier = 1 + fireRateBonus / 100;
    const damageMultiplier = 1 + damageBonus / 100;

    const effectiveRpm = baseRpm * fireRateMultiplier;
    const damagePerShot = baseDamage * damageMultiplier * (1 - mitigation);
    const dps = (damagePerShot * effectiveRpm) / 60;

    expect(round(effectiveRpm, 1)).toBe(660); // 600 * 1.1
    expect(round(damagePerShot, 2)).toBe(20.7); // 30 * 1.15 * 0.6
    expect(round(dps, 2)).toBe(227.7); // (20.7 * 660) / 60
  });

  it('should handle armor class reductions', () => {
    const baseDamage = 50;
    const modeMultiplier = 1;
    const hitboxMultiplier = 1;

    // No armor
    const noneArmor = baseDamage * modeMultiplier * hitboxMultiplier * (1 - 0);
    expect(noneArmor).toBe(50);

    // Light armor (25% reduction)
    const lightArmor = baseDamage * modeMultiplier * hitboxMultiplier * (1 - 0.25);
    expect(round(lightArmor, 2)).toBe(37.5);

    // Medium armor (40% reduction)
    const mediumArmor = baseDamage * modeMultiplier * hitboxMultiplier * (1 - 0.4);
    expect(round(mediumArmor, 2)).toBe(30);

    // Heavy armor (55% reduction)
    const heavyArmor = baseDamage * modeMultiplier * hitboxMultiplier * (1 - 0.55);
    expect(round(heavyArmor, 2)).toBe(22.5);
  });

  it('should derive RPM from DPS when needed', () => {
    // If damage is known but RPM is missing, derive from DPS
    const baseDpsFromField = 200;
    const baseDamageFromField = 50;
    const calculatedRpm = (baseDpsFromField / baseDamageFromField) * 60;
    expect(calculatedRpm).toBe(240);
  });

  it('should derive damage from DPS when needed', () => {
    // If RPM is known but damage is missing, derive from DPS
    const baseDpsFromField = 300;
    const baseRpmFromField = 600;
    const calculatedDamage = (baseDpsFromField * 60) / baseRpmFromField;
    expect(calculatedDamage).toBe(30);
  });

  it('should clamp mitigation between 0 and 0.9', () => {
    expect(clamp(0, 0, 0.9)).toBe(0);
    expect(clamp(0.5, 0, 0.9)).toBe(0.5);
    expect(clamp(0.9, 0, 0.9)).toBe(0.9);
    expect(clamp(1.2, 0, 0.9)).toBe(0.9); // Capped at 90%
  });

  it('should round numbers correctly', () => {
    expect(round(123.456, 2)).toBe(123.46);
    expect(round(123.456, 1)).toBe(123.5);
    expect(round(123.456, 0)).toBe(123);
    expect(round(123.4, 3)).toBe(123.4);
  });

  it('realistic scenario: Light AR with bonuses vs medium armor', () => {
    // Assault rifle: 28 damage, 800 RPM
    // With: +10% fire rate barrel, +15% damage underbarrel
    // Target: Medium armor, torso, 100 HP
    const baseDamage = 28;
    const baseRpm = 800;
    const fireRateBonus = 10;
    const damageBonus = 15;
    const armorClass = 'medium';
    const hitbox = 'torso';
    const craftedMitigation = 0;
    const targetHealth = 100;

    const fireRateMultiplier = 1 + fireRateBonus / 100;
    const damageMultiplier = 1 + damageBonus / 100;
    const hitboxMultiplier = getHitboxMultiplier(hitbox);
    const baseReduction = getArmorReduction(armorClass);
    const mitigation = clamp(baseReduction + craftedMitigation / 100, 0, 0.9);

    const effectiveRpm = baseRpm * fireRateMultiplier;
    const damagePerShot = baseDamage * damageMultiplier * hitboxMultiplier * (1 - mitigation);
    const sustainedDps = (damagePerShot * effectiveRpm) / 60;
    const shotsToKill = Math.ceil(targetHealth / damagePerShot);
    const ttk = (shotsToKill - 1) / (effectiveRpm / 60);

    expect(round(effectiveRpm, 1)).toBe(880); // 800 * 1.1
    expect(round(damagePerShot, 2)).toBe(19.32); // 28 * 1.15 * 1 * 0.6
    expect(round(sustainedDps, 2)).toBe(283.36); // (19.32 * 880) / 60
    expect(shotsToKill).toBe(6); // ceil(100 / 19.32)
    expect(round(ttk, 3)).toBe(0.341); // (6 - 1) / (880 / 60)
  });
});
