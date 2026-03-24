import type { PrismaClient } from '@prisma/client';

export interface FpsDamageInput {
  itemUuid: string;
  env?: string;
  fireMode?: 'Single' | 'Burst' | 'Auto';
  hitbox?: 'head' | 'torso' | 'arm' | 'leg';
  armorClass?: 'none' | 'light' | 'medium' | 'heavy';
  health?: number;
  barrelRateBonus?: number;
  underbarrelDamageBonus?: number;
  craftedMitigationBonus?: number;
}

export interface FpsDamageResult {
  baseDamage: number;
  baseRpm: number;
  effectiveRpm: number;
  reductionPct: number;
  damagePerShot: number;
  sustainedDps: number;
  burstDps: number;
  shotsToKill: number;
  ttk: number;
  timeline: number[];
  activeModifiers: string[];
  magazineSize: number | null;
  effectiveRange: number | null;
  damagePhysical: number;
  damageEnergy: number;
  damageDistortion: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round(v: number, d = 2): number {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

function getHitboxMultiplier(hitbox: string): number {
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

function inferFireMode(item: { name?: string | null; subType?: string | null; className?: string | null }): 'Single' | 'Burst' | 'Auto' {
  const probe = `${item.name || ''} ${item.subType || ''} ${item.className || ''}`.toLowerCase();
  if (/burst/.test(probe)) return 'Burst';
  if (/sniper|shotgun|railgun|single/.test(probe)) return 'Single';
  return 'Auto';
}

function buildShotTimeline(ttk: number, rpm: number, shotsToKill: number): number[] {
  if (rpm <= 0 || shotsToKill <= 0) return [];
  const interval = 60 / rpm;
  const points: number[] = [];
  const cap = Math.min(shotsToKill, 40);
  for (let i = 0; i < cap; i++) {
    points.push(round(i * interval, 3));
  }
  if (ttk > 0 && points[points.length - 1] !== ttk) points.push(round(ttk, 3));
  return points;
}

export async function calculateFpsDamage(prisma: PrismaClient, input: FpsDamageInput): Promise<FpsDamageResult | null> {
  const env = input.env || 'live';
  const item = await prisma.item.findFirst({
    where: { uuid: input.itemUuid, gameEnv: env },
  });
  if (!item) return null;

  const dj = (item.dataJson as Record<string, unknown> | null) ?? {};

  const baseDamageFromField =
    Number(item.weaponDamage ?? 0) ||
    Number(Number(dj.damagePhysical ?? 0) + Number(dj.damageEnergy ?? 0) + Number(dj.damageDistortion ?? 0));
  const baseDpsFromField = Number(item.weaponDps ?? 0);
  const baseFireRateFromField = Number(item.weaponFireRate ?? 0);

  const resolvedFireMode = inferFireMode(item);
  const appliedMode = input.fireMode || resolvedFireMode;
  const modeRateMultiplier = appliedMode === 'Burst' ? 1.08 : 1;
  const modeDamageMultiplier = appliedMode === 'Single' ? 1.03 : 1;

  let baseRpm = baseFireRateFromField;
  let baseDamage = baseDamageFromField;

  if (baseDamage <= 0 && baseDpsFromField > 0 && baseRpm > 0) {
    baseDamage = (baseDpsFromField * 60) / baseRpm;
  }
  if (baseRpm <= 0 && baseDamage > 0 && baseDpsFromField > 0) {
    baseRpm = (baseDpsFromField / baseDamage) * 60;
  }

  const hitbox = input.hitbox || 'torso';
  const armorClass = input.armorClass || 'medium';
  const barrelRateBonus = clamp(input.barrelRateBonus ?? 0, 0, 100);
  const underbarrelDamageBonus = clamp(input.underbarrelDamageBonus ?? 0, 0, 100);
  const craftedMitigationBonus = clamp(input.craftedMitigationBonus ?? 0, 0, 100);
  const health = Math.max(1, input.health ?? 100);

  const fireRateMultiplier = 1 + barrelRateBonus / 100;
  const damageMultiplier = 1 + underbarrelDamageBonus / 100;
  const hitboxMultiplier = getHitboxMultiplier(hitbox);
  const baseReduction = armorClass === 'none' ? 0 : getArmorReduction(armorClass);
  const mitigation = clamp(baseReduction + craftedMitigationBonus / 100, 0, 0.9);

  const effectiveRpm = baseRpm * fireRateMultiplier * modeRateMultiplier;
  const damagePerShotRaw = baseDamage * damageMultiplier * modeDamageMultiplier * hitboxMultiplier;
  const damagePerShot = damagePerShotRaw * (1 - mitigation);
  const sustainedDps = effectiveRpm > 0 ? (damagePerShot * effectiveRpm) / 60 : 0;
  const burstDps = sustainedDps * (appliedMode === 'Burst' ? 1.12 : 1.04);

  const shotsToKill = damagePerShot > 0 ? Math.ceil(health / damagePerShot) : 0;
  const ttk = Number.isFinite(shotsToKill) && shotsToKill > 1 && effectiveRpm > 0 ? (shotsToKill - 1) / (effectiveRpm / 60) : 0;

  const timeline = buildShotTimeline(ttk, effectiveRpm, shotsToKill);

  const activeModifiers: string[] = [];
  if (barrelRateBonus > 0) activeModifiers.push(`Fire rate +${barrelRateBonus}%`);
  if (underbarrelDamageBonus > 0) activeModifiers.push(`Damage +${underbarrelDamageBonus}%`);
  if (craftedMitigationBonus > 0) activeModifiers.push(`Target mitigation +${craftedMitigationBonus}%`);
  if (hitbox !== 'torso') activeModifiers.push(`Hitbox: ${hitbox}`);
  if (appliedMode !== resolvedFireMode) activeModifiers.push(`Fire mode override: ${appliedMode}`);

  return {
    baseDamage: round(baseDamage, 2),
    baseRpm: round(baseRpm, 1),
    effectiveRpm: round(effectiveRpm, 1),
    reductionPct: round(mitigation * 100, 1),
    damagePerShot: round(damagePerShot, 2),
    sustainedDps: round(sustainedDps, 2),
    burstDps: round(burstDps, 2),
    shotsToKill,
    ttk: round(ttk, 3),
    timeline,
    activeModifiers,
    magazineSize: item.weaponAmmoCount ?? null,
    effectiveRange: Number(item.weaponRange ?? 0) || null,
    damagePhysical: round(Number(dj.damagePhysical ?? 0), 2),
    damageEnergy: round(Number(dj.damageEnergy ?? 0), 2),
    damageDistortion: round(Number(dj.damageDistortion ?? 0), 2),
  };
}
