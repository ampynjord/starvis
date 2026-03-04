/**
 * ShipLoadout — Composant d'affichage complet du loadout par défaut d'un vaisseau.
 *
 * Sections générées automatiquement selon les composants présents :
 * - Weapons (armes, gimbals, mining, tractor, EMP/QIG)
 * - Missiles (racks + missiles enfants)
 * - Shields
 * - Systems (Cooler, Power Plant, Quantum Drive + Jump Module, Radar)
 * - Thrusters (Main / Maneuvering / Retro)
 * - Countermeasures (stats uniquement, pas de section dédiée)
 */

import { Link } from 'react-router-dom';
import type { LoadoutNode } from '@/types/api';

// ── Grade ────────────────────────────────────────────────
const GRADE_COLOR: Record<string, string> = {
  A: 'text-emerald-400 border-emerald-800',
  B: 'text-cyan-400 border-cyan-900',
  C: 'text-slate-400 border-slate-700',
  D: 'text-amber-500 border-amber-900',
  E: 'text-red-400 border-red-900',
};

function GradePill({ grade }: { grade: string | null }) {
  if (!grade) return null;
  const color = GRADE_COLOR[grade] ?? 'text-slate-500 border-slate-700';
  return (
    <span className={`text-xs font-mono-sc border rounded px-1 leading-none py-0.5 ${color}`}>
      {grade}
    </span>
  );
}

// ── Size badge ───────────────────────────────────────────
function SizeBadge({ size }: { size: number | null | undefined }) {
  if (size == null) return null;
  return (
    <span className="text-xs font-mono-sc bg-slate-800 text-slate-500 border border-slate-700 rounded px-1 py-0.5 leading-none flex-shrink-0">
      S{size}
    </span>
  );
}

// ── Count badge ──────────────────────────────────────────
function CountBadge({ count }: { count: number }) {
  if (count <= 1) return null;
  return (
    <span className="text-xs font-mono-sc text-slate-400 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 leading-none flex-shrink-0">
      ×{count}
    </span>
  );
}

// ── Manufacturer badge ───────────────────────────────────
function MfrBadge({ code }: { code: string | null | undefined }) {
  if (!code) return null;
  return (
    <span className="text-xs font-mono-sc text-slate-600">[{code}]</span>
  );
}

// ── Row container ────────────────────────────────────────
function LoadoutRow({
  size,
  name,
  grade,
  mfr,
  count,
  meta,
  uuid,
  children,
}: {
  size?: number | null;
  name: string;
  grade?: string | null;
  mfr?: string | null;
  count?: number;
  meta?: React.ReactNode;
  uuid?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 transition-colors">
        <SizeBadge size={size} />
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          {uuid ? (
            <Link
              to={`/components/${uuid}`}
              className="text-sm text-slate-200 hover:text-cyan-400 transition-colors truncate"
            >
              {name}
            </Link>
          ) : (
            <span className="text-sm text-slate-200 truncate">{name}</span>
          )}
          <CountBadge count={count ?? 1} />
          <MfrBadge code={mfr} />
          <GradePill grade={grade ?? null} />
          {meta && <span className="text-xs text-slate-600">{meta}</span>}
        </div>
      </div>
      {children && (
        <div className="ml-6 border-l border-border/30 pl-3 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Sub-row (indented) ───────────────────────────────────
function SubRow({
  size,
  name,
  grade,
  mfr,
  count,
  uuid,
}: {
  size?: number | null;
  name: string;
  grade?: string | null;
  mfr?: string | null;
  count?: number;
  uuid?: string | null;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 transition-colors">
      <span className="text-xs text-slate-700">└</span>
      <SizeBadge size={size} />
      <div className="flex-1 flex items-center gap-2 flex-wrap">
        {uuid ? (
          <Link
            to={`/components/${uuid}`}
            className="text-xs text-slate-400 hover:text-cyan-400 transition-colors"
          >
            {name}
          </Link>
        ) : (
          <span className="text-xs text-slate-400">{name}</span>
        )}
        <CountBadge count={count ?? 1} />
        <MfrBadge code={mfr} />
        <GradePill grade={grade ?? null} />
      </div>
    </div>
  );
}

// ── Section container ────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-mono-sc text-slate-600 uppercase tracking-widest mb-2 border-b border-border/30 pb-1">
        {title}
      </h4>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────
function isNoisyPort(n: LoadoutNode): boolean {
  const p = n.port_name.toLowerCase();
  if (p.includes('controller')) return true;
  if (p.endsWith('_door') || p.includes('_door_') || p === 'radar_helper') return true;
  // Quantum fuel tank (port_type = QuantumDrive but component_type = FuelTank)
  if (n.component_type === 'FuelTank' || n.component_type === 'FuelIntake') return true;
  return false;
}

// ── Rack name builder ───────────────────────────────────
// MRCK_S02_ORIG_100i_Dual_S02 + size=2, rack_count=2, missile_size=2 → "100i-222"
function buildRackName(rack: LoadoutNode): string {
  const cls = rack.component_class_name ?? '';
  const count = rack.rack_count;
  const missileSize = rack.rack_missile_size;
  const rackSize = rack.component_size;

  // Strip MRCK or GMRCK prefix, then split: [S02, MFR, SHIP?, ...]
  const parts = cls.replace(/^G?MRCK_/i, '').split('_');
  // parts[0] = S##, parts[1] = manufacturer code, parts[2] = potential ship name
  let shipTag: string | null = null;
  if (parts.length >= 3) {
    const candidate = parts[2];
    // Ship tag has digits or mixed alphanumeric (e.g. "100i", "Perseus", "Fury")
    if (candidate && /\d/.test(candidate)) {
      shipTag = candidate;
    } else if (candidate && candidate.length > 2 && candidate !== 'Quad' && candidate !== 'Dual' && candidate !== 'Single') {
      shipTag = candidate;
    }
  }

  if (shipTag && count != null && missileSize != null && rackSize != null) {
    return `${shipTag}-${rackSize}${count}${missileSize}`;
  }
  if (count != null && missileSize != null && rackSize != null) {
    return `Rack S${rackSize} (${count}×S${missileSize})`;
  }
  return rack.component_name ?? 'Missile Rack';
}

function parseJumpDriveName(className: string): string {
  // JDRV_TARS_S01_Explorer_SCItem → "Explorer (TARS)"
  const m = className.match(/^JDRV_([A-Z0-9]+)_S\d{2}_([^_]+)/i);
  if (m) return `${m[2]} (${m[1]})`;
  return className
    .replace(/^JDRV_/i, '')
    .replace(/_SCItem$/i, '')
    .replace(/_/g, ' ');
}

// Extract size from JDRV class_name: JDRV_TARS_S01_Explorer_SCItem → 1
function parseJumpDriveSize(className: string | null | undefined): number | null {
  if (!className) return null;
  const m = className.match(/^JDRV_[A-Z0-9]+_S(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

// Convert N → MN string
function toMN(n: number) {
  return (n / 1_000_000).toFixed(2);
}

// Strip "S## " size prefix embedded in component names from DB (e.g. "S01 Ecouter" → "Ecouter")
function cleanCompName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.replace(/^S\d{2}\s+/, '');
}

// Extract real manufacturer code from class_name.
// For type-prefixed class_names, the DB stores the type code in manufacturer_code instead.
// Pattern: {TYPECODE}_{MFR}_{SIZE}_..._SCItem → real mfr is segment[1]
// Exception for racks: MRCK_{SIZE}_{MFR}_... → real mfr is segment[2]
const COMPONENT_TYPE_PREFIXES = new Set(['COOL','RADR','SHLD','QDRV','PWRP','PPLNT','THRM','POWR']);
function extractMfr(
  className: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  if (!className) return fallback ?? null;
  const parts = className.split('_');
  const prefix = (parts[0] ?? '').toUpperCase();
  if (prefix === 'MRCK' || prefix === 'GMRCK') {
    // MRCK_S02_ORIG_100i_... → segment[2] is manufacturer
    return parts[2] ?? fallback ?? null;
  }
  if (COMPONENT_TYPE_PREFIXES.has(prefix)) {
    // COOL_AEGS_S03_..., RADR_GRNP_S01_..., SHLD_BEHR_S02_... → segment[1]
    return parts[1] ?? fallback ?? null;
  }
  // WeaponGun, Thruster, Gimbal... → manufacturer_code already correct
  return fallback ?? null;
}

// ── Interfaces internes ──────────────────────────────────
interface WeaponSlot {
  mount: LoadoutNode | null;
  weapon: LoadoutNode | null;
  count: number;
}
interface RackSlot {
  rack: LoadoutNode;
  missiles: LoadoutNode[];
  missileCount: number;
  count: number;
}
interface SystemItem {
  node: LoadoutNode;
  count: number;
  jumpModule: LoadoutNode | null;
}
interface ThrusterGroup {
  type: string;
  size: number | null;
  count: number;
  totalThrust: number; // N
}

interface ProcessedLoadout {
  weapons: WeaponSlot[];
  racks: RackSlot[];
  shields: SystemItem[];
  systems: SystemItem[];
  thrusters: ThrusterGroup[];
  cmDecoys: Array<{ name: string; count: number }>;
  cmNoises: Array<{ name: string; count: number }>;
  defaultPaint: string | null;
}

const THRUSTER_ORDER = ['Main', 'Maneuvering', 'Retro'];
const WEAPON_TYPES = new Set([
  'WeaponGun', 'Weapon', 'MiningLaser', 'SalvageHead',
  'TractorBeam', 'RepairBeam', 'EMP', 'QuantumInterdictionGenerator', 'UtilityWeapon',
]);

function processLoadout(nodes: LoadoutNode[]): ProcessedLoadout {
  const rawWeapons: Array<{ mount: LoadoutNode | null; weapon: LoadoutNode | null }> = [];
  const rawRacks: Array<{ rack: LoadoutNode; missiles: LoadoutNode[] }> = [];
  const rawShields: LoadoutNode[] = [];
  const rawSystems: Array<{ node: LoadoutNode; jumpModule: LoadoutNode | null }> = [];
  const rawThrusters: LoadoutNode[] = [];
  const cmDecoyMap = new Map<string, number>();
  const cmNoiseMap = new Map<string, number>();
  let defaultPaint: string | null = null;

  for (const node of nodes) {
    if (isNoisyPort(node)) continue;

    const portType = node.port_type;
    const compType = node.component_type;

    // Peinture par défaut
    if (node.port_name === 'hardpoint_paint' && node.component_name) {
      defaultPaint = node.component_name;
      continue;
    }

    // Countermeasures → stats only
    if (compType === 'Countermeasure' && node.component_uuid) {
      const name = node.component_name ?? 'Unknown';
      const nameLc = name.toLowerCase();
      if (nameLc.includes('noise') || nameLc.includes('flare') || nameLc.includes('chaff')) {
        cmNoiseMap.set(name, (cmNoiseMap.get(name) ?? 0) + 1);
      } else {
        cmDecoyMap.set(name, (cmDecoyMap.get(name) ?? 0) + 1);
      }
      continue;
    }

    // Weapon mounts (Gimbal / Turret / WeaponRack avec port)
    if ((portType === 'Gimbal' || portType === 'Turret' || portType === 'WeaponRack') && node.component_uuid) {
      const weapon = node.children.find(c =>
        c.component_type && WEAPON_TYPES.has(c.component_type)
      ) ?? null;
      rawWeapons.push({ mount: node, weapon });
      continue;
    }

    // Direct weapons (no parent mount)
    if (compType && WEAPON_TYPES.has(compType) && node.component_uuid) {
      rawWeapons.push({ mount: null, weapon: node });
      continue;
    }

    // Missile Racks
    if ((portType === 'MissileRack' || compType === 'MissileRack') && node.component_uuid) {
      const missiles = node.children.filter(c =>
        c.component_type === 'Missile' || c.port_type === 'Missile' ||
        (c.port_name ?? '').includes('missile')
      );
      rawRacks.push({ rack: node, missiles });
      continue;
    }

    // Shields
    if (compType === 'Shield' && node.component_uuid) {
      rawShields.push(node);
      continue;
    }

    // Thrusters
    if (portType === 'Thruster' && compType === 'Thruster' && node.component_uuid) {
      rawThrusters.push(node);
      continue;
    }

    // QD (only the actual QD component, not fuel tank)
    if (portType === 'QuantumDrive' && compType === 'QuantumDrive' && node.component_uuid) {
      const jumpChild = node.children.find(c => {
        const cls = (c.component_class_name ?? '').toUpperCase();
        return cls.startsWith('JDRV') || c.component_type === 'JumpDrive';
      }) ?? null;
      rawSystems.push({ node, jumpModule: jumpChild });
      continue;
    }

    // Other systems (Cooler, PowerPlant, Radar)
    if (['Cooler', 'PowerPlant', 'Radar'].includes(compType ?? '') && node.component_uuid) {
      rawSystems.push({ node, jumpModule: null });
      continue;
    }
  }

  // ── Dedup weapons ──────────────────────────────────────
  const weaponMap = new Map<string, WeaponSlot>();
  for (const { mount, weapon } of rawWeapons) {
    const key = `${mount?.component_name ?? 'fixed'}|${weapon?.component_name ?? 'empty'}`;
    const ex = weaponMap.get(key);
    if (ex) ex.count++;
    else weaponMap.set(key, { mount, weapon, count: 1 });
  }
  const weapons = Array.from(weaponMap.values());

  // ── Dedup racks ────────────────────────────────────────
  const rackMap = new Map<string, RackSlot>();
  for (const { rack, missiles } of rawRacks) {
    const key = rack.component_name ?? rack.component_class_name ?? rack.port_name;
    const ex = rackMap.get(key);
    if (ex) {
      ex.count++;
      ex.missileCount += missiles.length;
    } else {
      rackMap.set(key, { rack, missiles, missileCount: missiles.length, count: 1 });
    }
  }
  const racks = Array.from(rackMap.values());

  // ── Dedup shields ──────────────────────────────────────
  const shieldMap = new Map<string, SystemItem>();
  for (const node of rawShields) {
    const key = node.component_name ?? node.port_name;
    const ex = shieldMap.get(key);
    if (ex) ex.count++;
    else shieldMap.set(key, { node, count: 1, jumpModule: null });
  }
  const shields = Array.from(shieldMap.values());

  // ── Dedup systems ──────────────────────────────────────
  const sysMap = new Map<string, SystemItem>();
  for (const { node, jumpModule } of rawSystems) {
    const key = `${node.component_type}|${node.component_name ?? node.port_name}`;
    const ex = sysMap.get(key);
    if (ex) ex.count++;
    else sysMap.set(key, { node, count: 1, jumpModule });
  }
  // Sort: Cooler, PowerPlant, QuantumDrive, Radar
  const SYS_ORDER = ['Cooler', 'PowerPlant', 'QuantumDrive', 'Radar'];
  const systems = Array.from(sysMap.values()).sort((a, b) => {
    const ai = SYS_ORDER.indexOf(a.node.component_type ?? '');
    const bi = SYS_ORDER.indexOf(b.node.component_type ?? '');
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // ── Group thrusters ────────────────────────────────────
  const thrusterMap = new Map<string, ThrusterGroup>();
  for (const node of rawThrusters) {
    const thrType = node.thruster_type ?? 'Main';
    const thrust = node.thruster_max_thrust ?? 0;
    const size = node.component_size ?? null;
    const key = `${thrType}|${size}`;
    const ex = thrusterMap.get(key);
    if (ex) {
      ex.count++;
      ex.totalThrust += thrust;
    } else {
      thrusterMap.set(key, { type: thrType, size, count: 1, totalThrust: thrust });
    }
  }
  // Sort by THRUSTER_ORDER, then by type key alphabetically for unknowns
  const allGroups = Array.from(thrusterMap.values());
  const thrusters = [
    ...THRUSTER_ORDER.flatMap(t =>
      allGroups.filter(g => g.type === t).sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    ),
    ...allGroups.filter(g => !THRUSTER_ORDER.includes(g.type)),
  ];

  return {
    weapons,
    racks,
    shields,
    systems,
    thrusters,
    cmDecoys: Array.from(cmDecoyMap.entries()).map(([name, count]) => ({ name, count })),
    cmNoises: Array.from(cmNoiseMap.entries()).map(([name, count]) => ({ name, count })),
    defaultPaint,
  };
}

// ── Weapon type label ────────────────────────────────────
const WEAPON_TYPE_LABELS: Record<string, string> = {
  WeaponGun: 'Gun',
  MiningLaser: 'Mining',
  SalvageHead: 'Salvage',
  TractorBeam: 'Tractor',
  RepairBeam: 'Repair',
  EMP: 'EMP',
  QuantumInterdictionGenerator: 'QED',
  UtilityWeapon: 'Utility',
};

const SYS_LABELS: Record<string, string> = {
  Cooler: 'Cooler',
  PowerPlant: 'Power',
  QuantumDrive: 'Quantum Drive',
  Radar: 'Radar',
};

// ── Main component ───────────────────────────────────────
interface Props {
  nodes: LoadoutNode[];
}

export function ShipLoadout({ nodes }: Props) {
  const data = processLoadout(nodes);

  const hasWeapons = data.weapons.length > 0;
  const hasRacks = data.racks.length > 0;
  const hasShields = data.shields.length > 0;
  const hasSystems = data.systems.length > 0;
  const hasThrusters = data.thrusters.length > 0;
  const hasCM = data.cmDecoys.length > 0 || data.cmNoises.length > 0;

  const totalDecoys = data.cmDecoys.reduce((s, c) => s + c.count, 0);
  const totalNoises = data.cmNoises.reduce((s, c) => s + c.count, 0);

  return (
    <div className="space-y-6">
      {/* ── Countermeasures — résumé haut ──────────── */}
      {hasCM && (
        <div className="flex items-center gap-4 text-xs font-mono-sc text-slate-500 pb-2 border-b border-border/20">
          <span className="text-slate-700 uppercase tracking-widest">CM</span>
          {totalDecoys > 0 && (
            <span>{totalDecoys}× Decoy{totalDecoys > 1 ? 's' : ''}</span>
          )}
          {totalNoises > 0 && (
            <span>{totalNoises}× Noise{totalNoises > 1 ? 's' : ''}</span>
          )}
        </div>
      )}
      {/* ── Weapons ────────────────────────────────── */}
      {hasWeapons && (
        <Section title="Weapons & Utilities">
          {data.weapons.map((slot, i) => {
            const weapon = slot.weapon;
            const mount = slot.mount;
            const wType = weapon?.component_type ?? null;
            const wLabel = wType ? (WEAPON_TYPE_LABELS[wType] ?? null) : null;

            if (mount) {
              // Weapon in a gimbal/turret
              return (
                <LoadoutRow
                  key={i}
                  size={mount.component_size ?? mount.port_max_size}
                  name={cleanCompName(mount.component_name) ?? `${mount.port_type} Mount`}
                  mfr={extractMfr(mount.component_class_name, mount.manufacturer_code)}
                  count={slot.count}
                  uuid={mount.component_uuid}
                  meta={wLabel}
                >
                  {weapon ? (
                    <SubRow
                      size={weapon.component_size ?? weapon.port_max_size}
                      name={cleanCompName(weapon.component_name) ?? '—'}
                      mfr={extractMfr(weapon.component_class_name, weapon.manufacturer_code)}
                      count={slot.count}
                      uuid={weapon.component_uuid}
                    />
                  ) : (
                    <SubRow name="— empty —" />
                  )}
                </LoadoutRow>
              );
            } else {
              // Direct weapon
              const w = weapon!;
              return (
                <LoadoutRow
                  key={i}
                  size={w.component_size ?? w.port_max_size}
                  name={cleanCompName(w.component_name) ?? '—'}
                  mfr={extractMfr(w.component_class_name, w.manufacturer_code)}
                  count={slot.count}
                  uuid={w.component_uuid}
                  meta={wLabel}
                />
              );
            }
          })}
        </Section>
      )}

      {/* ── Racks & Missiles ───────────────────────── */}
      {hasRacks && (
        <Section title="Racks">
          {data.racks.map((slot, i) => {
            const missileNode = slot.missiles[0] ?? null;
            const totalMissiles = slot.missileCount;
            return (
              <LoadoutRow
                key={i}
                size={slot.rack.component_size ?? slot.rack.port_max_size}
                name={buildRackName(slot.rack)}
                mfr={extractMfr(slot.rack.component_class_name, slot.rack.manufacturer_code)}
                count={slot.count}
                uuid={slot.rack.component_uuid}
              >
                {missileNode && (
                  <SubRow
                    size={missileNode.component_size ?? missileNode.port_max_size}
                    name={cleanCompName(missileNode.component_name) ?? 'Missile'}
                    mfr={extractMfr(missileNode.component_class_name, missileNode.manufacturer_code)}
                    count={totalMissiles}
                    uuid={missileNode.component_uuid}
                  />
                )}
              </LoadoutRow>
            );
          })}
        </Section>
      )}

      {/* ── Shields ────────────────────────────────── */}
      {hasShields && (
        <Section title="Shield">
          {data.shields.map((item, i) => (
            <LoadoutRow
              key={i}
              size={item.node.component_size}
              name={cleanCompName(item.node.component_name) ?? '—'}
              grade={item.node.grade}
              mfr={extractMfr(item.node.component_class_name, item.node.manufacturer_code)}
              count={item.count}
              uuid={item.node.component_uuid}
              meta={item.node.shield_hp != null ? `${item.node.shield_hp.toLocaleString('en-US')} HP` : undefined}
            />
          ))}
        </Section>
      )}

      {/* ── Systems ────────────────────────────────── */}
      {hasSystems && (
        <Section title="Systems">
          {data.systems.map((item, i) => {
            const typeLabel = SYS_LABELS[item.node.component_type ?? ''] ?? item.node.component_type;
            const jm = item.jumpModule;
            return (
              <LoadoutRow
                key={i}
                size={item.node.component_size}
                name={cleanCompName(item.node.component_name) ?? '—'}
                grade={item.node.grade}
                mfr={extractMfr(item.node.component_class_name, item.node.manufacturer_code)}
                count={item.count}
                uuid={item.node.component_uuid}
                meta={typeLabel}
              >
                {jm && (
                  <SubRow
                    name={
                      jm.component_name
                        ? cleanCompName(jm.component_name) ?? 'Jump Module'
                        : jm.component_class_name
                          ? parseJumpDriveName(jm.component_class_name)
                          : 'Jump Module'
                    }
                    grade={jm.grade}
                    mfr={extractMfr(jm.component_class_name, jm.manufacturer_code)}
                    uuid={jm.component_uuid}
                    size={jm.component_size ?? parseJumpDriveSize(jm.component_class_name)}
                  />
                )}
              </LoadoutRow>
            );
          })}
        </Section>
      )}

      {/* ── Thrusters ──────────────────────────────── */}
      {hasThrusters && (
        <Section title="Thrusters">
          {data.thrusters.map((g, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                {g.size != null && (
                  <span className="text-xs font-mono-sc bg-slate-800 text-slate-500 border border-slate-700 rounded px-1 py-0.5 leading-none flex-shrink-0">
                    S{g.size}
                  </span>
                )}
                <span className="text-sm text-slate-300">{g.type}</span>
                <span className="text-xs font-mono-sc text-slate-500">
                  ×{g.count}
                </span>
              </div>
              <span className="text-xs font-mono-sc text-slate-500">
                thrust capacity&nbsp;{toMN(g.totalThrust)}&nbsp;MN
              </span>
            </div>
          ))}
        </Section>
      )}

      {/* ── Peinture par défaut ─────────────────────── */}
      {data.defaultPaint && (
        <div>
          <h4 className="text-xs font-mono-sc text-slate-600 uppercase tracking-widest mb-2 border-b border-border/30 pb-1">
            Default Paint
          </h4>
          <span className="text-sm text-slate-400">{data.defaultPaint}</span>
        </div>
      )}
    </div>
  );
}
