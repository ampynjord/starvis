/**
 * ShipLoadout — Layout carte inspiré erkul.games
 * Chaque port est une carte individuelle, stats inline par type.
 */

import { Link } from 'react-router-dom';
import type { LoadoutNode } from '@/types/api';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const COMPONENT_TYPE_PREFIXES = new Set([
  'COOL','RADR','SHLD','QDRV','PWRP','PPLNT','THRM','POWR',
]);

function extractMfr(
  className: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  if (!className) return fallback ?? null;
  const parts = className.split('_');
  const prefix = (parts[0] ?? '').toUpperCase();
  if (prefix === 'MRCK' || prefix === 'GMRCK') return parts[2] ?? fallback ?? null;
  if (COMPONENT_TYPE_PREFIXES.has(prefix)) return parts[1] ?? fallback ?? null;
  return fallback ?? null;
}

function cleanCompName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.replace(/^S\d{2}\s+/, '');
}

/** "hardpoint_gun_laser_bottom_left" → "Bottom Left" */
function cleanPortName(portName: string): string {
  return portName
    .replace(/^hardpoint_/, '')
    .replace(/_/g, ' ')
    .replace(/\b(hardpoint|base|scitem|controller)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1));
}

function isNoisyPort(n: LoadoutNode): boolean {
  const p = n.port_name.toLowerCase();
  if (p.includes('controller')) return true;
  if (p.endsWith('_door') || p.includes('_door_') || p === 'radar_helper') return true;
  if (n.component_type === 'FuelTank' || n.component_type === 'FuelIntake') return true;
  return false;
}

function toMN(n: number) {
  return (n / 1_000_000).toFixed(2);
}

function parseJumpDriveName(className: string): string {
  const m = className.match(/^JDRV_([A-Z0-9]+)_S\d{2}_([^_]+)/i);
  if (m) return `${m[2]} (${m[1]})`;
  return className.replace(/^JDRV_/i, '').replace(/_SCItem$/i, '').replace(/_/g, ' ');
}

function parseJumpDriveSize(className: string | null | undefined): number | null {
  if (!className) return null;
  const m = className.match(/^JDRV_[A-Z0-9]+_S(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function buildRackName(rack: LoadoutNode): string {
  const cls = rack.component_class_name ?? '';
  const count = rack.rack_count;
  const missileSize = rack.rack_missile_size;
  const rackSize = rack.component_size;
  const parts = cls.replace(/^G?MRCK_/i, '').split('_');
  let shipTag: string | null = null;
  if (parts.length >= 3) {
    const candidate = parts[2];
    if (candidate && /\d/.test(candidate)) shipTag = candidate;
    else if (candidate && candidate.length > 2 && !['Quad','Dual','Single'].includes(candidate)) shipTag = candidate;
  }
  if (shipTag && count != null && missileSize != null && rackSize != null)
    return `${shipTag}-${rackSize}${count}${missileSize}`;
  if (count != null && missileSize != null && rackSize != null)
    return `Rack S${rackSize} (${count}xS${missileSize})`;
  return rack.component_name ?? 'Missile Rack';
}

// ─────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────

// Grade A/B = Military, C = Civilian, D/E = Industrial
const GRADE_INFO: Record<string, { abbr: string; color: string }> = {
  A: { abbr: 'MIL', color: 'text-emerald-300 bg-emerald-950/60 border-emerald-800/60' },
  B: { abbr: 'MIL', color: 'text-cyan-300   bg-cyan-950/60   border-cyan-800/60'   },
  C: { abbr: 'CIV', color: 'text-slate-300  bg-slate-800/60  border-slate-600/60'  },
  D: { abbr: 'IND', color: 'text-amber-300  bg-amber-950/60  border-amber-800/60'  },
  E: { abbr: 'IND', color: 'text-red-300    bg-red-950/60    border-red-800/60'    },
};

function GradePill({ grade }: { grade: string | null }) {
  if (!grade) return null;
  const info = GRADE_INFO[grade];
  if (!info) return (
    <span className="text-[9px] font-mono-sc font-bold border rounded px-1 py-0.5 leading-none text-slate-500 bg-slate-900 border-slate-700">
      {grade}
    </span>
  );
  return (
    <span className={`text-[9px] font-mono-sc font-bold border rounded px-1 py-0.5 leading-none ${info.color}`}>
      {info.abbr} {grade}
    </span>
  );
}

function SizeBadge({ size }: { size: number | null | undefined }) {
  if (size == null) return null;
  return (
    <span className="text-[9px] font-mono-sc font-bold bg-slate-800 text-slate-400 border border-slate-700 rounded px-1.5 py-0.5 leading-none flex-shrink-0">
      S{size}
    </span>
  );
}

function StatPill({ label, value, color = 'text-slate-400' }: {
  label: string; value: string | number; color?: string;
}) {
  return (
    <span className="flex items-center gap-0.5">
      <span className="text-[9px] font-mono-sc text-slate-600 uppercase">{label}</span>
      <span className={`text-[10px] font-orbitron font-bold tabular-nums ${color}`}>{value}</span>
    </span>
  );
}

// ─────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────

function Section({ title, accent, count, children }: {
  title: string; accent: string; count?: number; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-[10px] font-mono-sc uppercase tracking-widest font-bold ${accent}`}>{title}</span>
        {count != null && (
          <span className="text-[9px] font-mono-sc text-slate-600 border border-slate-800 rounded px-1">
            {count}
          </span>
        )}
        <span className="flex-1 h-px bg-slate-800" />
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
// Weapon card
// ─────────────────────────────────────────────

const WEAPON_TYPE_LABELS: Record<string, string> = {
  WeaponGun: '', MiningLaser: 'Mining', SalvageHead: 'Salvage',
  TractorBeam: 'Tractor', RepairBeam: 'Repair',
  EMP: 'EMP', QuantumInterdictionGenerator: 'QED', UtilityWeapon: 'Utility',
};

const MOUNT_TYPE_STYLE: Record<string, string> = {
  Gimbal:     'text-violet-400 bg-violet-950/40 border-violet-900/60',
  Turret:     'text-amber-400  bg-amber-950/40  border-amber-900/60',
  WeaponRack: 'text-cyan-400   bg-cyan-950/40   border-cyan-900/60',
};

function WeaponCard({ portName, mount, weapon }: {
  portName: string; mount: LoadoutNode | null; weapon: LoadoutNode | null;
}) {
  const mountType = mount?.port_type ?? null;
  const displaySize = mount?.component_size ?? weapon?.component_size ?? null;
  const weaponName  = cleanCompName(weapon?.component_name);
  const mountName   = cleanCompName(mount?.component_name);
  const dps  = weapon?.weapon_dps    ? Math.round(parseFloat(String(weapon.weapon_dps))).toLocaleString('en-US') : null;
  const dmg  = weapon?.weapon_damage ? Math.round(parseFloat(String(weapon.weapon_damage))).toString() : null;
  const fr   = weapon?.weapon_fire_rate ? Math.round(parseFloat(String(weapon.weapon_fire_rate))).toString() : null;
  const rng  = weapon?.weapon_range  ? Math.round(parseFloat(String(weapon.weapon_range))).toString() : null;
  const wLabel = weapon?.component_type ? (WEAPON_TYPE_LABELS[weapon.component_type] ?? '') : '';
  const mountStyle = mountType ? (MOUNT_TYPE_STYLE[mountType] ?? '') : '';

  return (
    <div className="flex flex-col rounded-md border border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900 transition-all overflow-hidden">
      {/* Header: port name + type badges */}
      <div className="flex items-center justify-between gap-1 px-2 pt-1.5 pb-1 border-b border-slate-800/60">
        <span className="text-[9px] font-mono-sc text-slate-600 truncate flex-1 min-w-0">
          {cleanPortName(portName)}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {mountType && (
            <span className={`text-[8px] font-mono-sc border rounded px-1 py-0.5 leading-none ${mountStyle}`}>
              {mountType}
            </span>
          )}
          {wLabel && (
            <span className="text-[8px] font-mono-sc text-slate-500 border border-slate-700 rounded px-1 py-0.5 leading-none">
              {wLabel}
            </span>
          )}
          <SizeBadge size={displaySize} />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-2 py-1.5 space-y-1">
        {mount && mountName && (
          <p className="text-[9px] font-mono-sc text-slate-600 truncate">
            {mount.component_uuid
              ? <Link to={`/components/${mount.component_uuid}`} className="hover:text-slate-400 transition-colors">{mountName}</Link>
              : mountName}
          </p>
        )}
        {weaponName ? (
          <p className="text-[11px] font-semibold text-slate-200 leading-tight break-words">
            {weapon?.component_uuid
              ? <Link to={`/components/${weapon.component_uuid}`} className="hover:text-cyan-400 transition-colors">{weaponName}</Link>
              : weaponName}
          </p>
        ) : (
          <p className="text-[10px] font-mono-sc text-slate-700 italic">— empty —</p>
        )}
        {(dps || dmg || fr || rng) && (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5">
            {dps && <StatPill label="DPS" value={dps} color="text-red-400" />}
            {dmg && <StatPill label="dmg" value={dmg} color="text-orange-400" />}
            {fr  && <StatPill label="rpm" value={fr} />}
            {rng && <StatPill label="rng" value={`${rng}m`} />}
          </div>
        )}
      </div>

      {/* Footer: grade + mfr */}
      {(weapon?.grade || weapon?.manufacturer_code) && (
        <div className="flex items-center justify-between px-2 pb-1.5">
          <span className="text-[9px] font-mono-sc text-slate-700">
            {extractMfr(weapon.component_class_name, weapon.manufacturer_code)}
          </span>
          <GradePill grade={weapon.grade ?? null} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Turret card
// ─────────────────────────────────────────────

function TurretCard({ node }: { node: LoadoutNode }) {
  const turretName = cleanCompName(node.component_name);
  const gimbals = (node.children ?? []).filter(
    c => c.port_type === 'Gimbal' || (c.component_class_name ?? '').toLowerCase().includes('gimbal'),
  );

  return (
    <div className="flex flex-col rounded-md border border-amber-900/40 bg-amber-950/10 hover:border-amber-700/40 transition-all overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-1 px-2 pt-1.5 pb-1 border-b border-amber-900/30">
        <span className="text-[9px] font-mono-sc text-slate-600 truncate flex-1 min-w-0">
          {cleanPortName(node.port_name)}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[8px] font-mono-sc text-amber-400 bg-amber-950/40 border border-amber-900/60 rounded px-1 py-0.5 leading-none">
            Turret
          </span>
          <SizeBadge size={node.component_size ?? node.port_max_size} />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-2 py-1.5 space-y-1.5">
        {turretName && (
          <p className="text-[11px] font-semibold text-slate-200 leading-tight break-words">
            {node.component_uuid
              ? <Link to={`/components/${node.component_uuid}`} className="hover:text-cyan-400 transition-colors">{turretName}</Link>
              : turretName}
          </p>
        )}

        {/* Gimbal weapon slots */}
        {gimbals.length > 0 ? (
          <div className="space-y-1">
            {gimbals.map((g, i) => {
              const gimbalName = cleanCompName(g.component_name);
              const weapon = (g.children ?? []).find(
                c => c.component_type && WEAPON_TYPES.has(c.component_type),
              ) ?? null;
              const weaponName = cleanCompName(weapon?.component_name);
              const slotSize   = g.component_size ?? g.port_max_size;
              const dps        = weapon?.weapon_dps
                ? Math.round(parseFloat(String(weapon.weapon_dps)))
                : null;
              return (
                <div key={i} className="flex flex-col gap-0.5 pl-2 border-l-2 border-amber-900/30">
                  {/* Ligne gimbal */}
                  <div className="flex items-center gap-1.5">
                    {slotSize != null && <SizeBadge size={slotSize} />}
                    {gimbalName ? (
                      <span className="text-[9px] font-mono-sc text-violet-400 truncate flex-1 min-w-0">
                        {g.component_uuid
                          ? <Link to={`/components/${g.component_uuid}`} className="hover:text-violet-200 transition-colors">{gimbalName}</Link>
                          : gimbalName}
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono-sc text-slate-600 italic flex-1">— empty gimbal —</span>
                    )}
                  </div>
                  {/* Ligne arme */}
                  <div className="flex items-center gap-1.5 pl-3">
                    {weaponName ? (
                      <span className="text-[10px] font-semibold text-slate-200 truncate flex-1 min-w-0">
                        {weapon?.component_uuid
                          ? <Link to={`/components/${weapon.component_uuid}`} className="hover:text-cyan-400 transition-colors">{weaponName}</Link>
                          : weaponName}
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono-sc text-slate-700 italic flex-1">— empty —</span>
                    )}
                    {dps != null && (
                      <span className="text-[9px] font-mono-sc text-red-400 tabular-nums flex-shrink-0">{dps}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[9px] font-mono-sc text-slate-700 italic">— no slots —</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Rack card
// ─────────────────────────────────────────────

function RackCard({ rack, missiles }: { rack: LoadoutNode; missiles: LoadoutNode[] }) {
  const missileNode = missiles[0] ?? null;
  const missileName = cleanCompName(missileNode?.component_name);
  const rackName    = buildRackName(rack);
  const dmg = missileNode?.missile_damage
    ? Math.round(parseFloat(String(missileNode.missile_damage))).toLocaleString('en-US')
    : null;
  const sig = missileNode?.missile_signal_type;

  return (
    <div className="flex flex-col rounded-md border border-orange-900/40 bg-orange-950/10 hover:brightness-110 transition-all overflow-hidden">
      <div className="flex items-center justify-between px-2 pt-1.5 pb-1 border-b border-orange-900/30">
        <span className="text-[9px] font-mono-sc text-slate-600 truncate flex-1">
          {cleanPortName(rack.port_name)}
        </span>
        <SizeBadge size={rack.component_size ?? rack.port_max_size} />
      </div>
      <div className="flex-1 px-2 py-1.5 space-y-1">
        <p className="text-[9px] font-mono-sc text-orange-400/70 truncate">
          {rack.component_uuid
            ? <Link to={`/components/${rack.component_uuid}`} className="hover:text-orange-300 transition-colors">{rackName}</Link>
            : rackName}
        </p>
        {missileName ? (
          <p className="text-[11px] font-semibold text-slate-200 leading-tight break-words">
            {missileNode?.component_uuid
              ? <Link to={`/components/${missileNode.component_uuid}`} className="hover:text-cyan-400 transition-colors">{missileName}</Link>
              : missileName}
          </p>
        ) : (
          <p className="text-[10px] font-mono-sc text-slate-700 italic">— no missile —</p>
        )}
        {(dmg || sig || missiles.length > 0) && (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5">
            {dmg && <StatPill label="dmg" value={dmg} color="text-orange-400" />}
            {sig && <StatPill label="sig" value={sig} color="text-violet-400" />}
            {missiles.length > 0 && <StatPill label="x" value={missiles.length} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// System card
// ─────────────────────────────────────────────

const SYS_ACCENT: Record<string, { border: string; text: string; bg: string }> = {
  Cooler:       { border: 'border-cyan-900/50',   text: 'text-cyan-400',   bg: 'bg-cyan-950/15'    },
  PowerPlant:   { border: 'border-yellow-900/50', text: 'text-yellow-400', bg: 'bg-yellow-950/15'  },
  QuantumDrive: { border: 'border-violet-900/50', text: 'text-violet-400', bg: 'bg-violet-950/15'  },
  Radar:        { border: 'border-green-900/50',  text: 'text-green-400',  bg: 'bg-green-950/15'   },
};
const SYS_ICONS: Record<string, string>  = { Cooler: '❄', PowerPlant: '⚡', QuantumDrive: '⊛', Radar: '◈' };
const SYS_LABELS: Record<string, string> = { Cooler: 'Cooler', PowerPlant: 'Power Plant', QuantumDrive: 'Quantum Drive', Radar: 'Radar' };

function SystemCard({ node, jumpModule }: { node: LoadoutNode; jumpModule: LoadoutNode | null }) {
  const t = node.component_type ?? '';
  const accent = SYS_ACCENT[t] ?? { border: 'border-slate-800', text: 'text-slate-400', bg: '' };
  const icon   = SYS_ICONS[t] ?? '●';
  const label  = SYS_LABELS[t] ?? t;
  const name   = cleanCompName(node.component_name) ?? '—';

  let stats: React.ReactNode = null;
  if (t === 'Cooler' && node.cooling_rate) {
    const cr = parseFloat(String(node.cooling_rate));
    stats = <StatPill label="cooling" value={cr >= 1000 ? `${(cr/1000).toFixed(0)}k` : cr.toFixed(0)} color={accent.text} />;
  } else if (t === 'PowerPlant' && node.power_output) {
    stats = <StatPill label="power" value={`${parseFloat(String(node.power_output)).toFixed(0)} eu`} color={accent.text} />;
  } else if (t === 'QuantumDrive' && node.qd_speed) {
    const speed = parseFloat(String(node.qd_speed));
    stats = (
      <>
        <StatPill label="speed" value={`${(speed/1e6).toFixed(0)}Mm/s`} color={accent.text} />
        {node.qd_spool_time && <StatPill label="spool" value={`${parseFloat(String(node.qd_spool_time)).toFixed(1)}s`} />}
      </>
    );
  }

  const jmName = jumpModule
    ? (jumpModule.component_name
        ? cleanCompName(jumpModule.component_name)
        : jumpModule.component_class_name
          ? parseJumpDriveName(jumpModule.component_class_name)
          : 'Jump Module')
    : null;
  const jmSize = jumpModule?.component_size ?? parseJumpDriveSize(jumpModule?.component_class_name);

  return (
    <div className={`flex flex-col rounded-md border ${accent.border} ${accent.bg} hover:brightness-110 transition-all overflow-hidden`}>
      <div className={`flex items-center gap-1.5 px-2 py-1 border-b ${accent.border}`}>
        <span className={`text-[10px] ${accent.text}`}>{icon}</span>
        <span className={`text-[9px] font-mono-sc uppercase tracking-wider ${accent.text} opacity-70 flex-1`}>{label}</span>
        <SizeBadge size={node.component_size} />
        <GradePill grade={node.grade ?? null} />
      </div>
      <div className="flex-1 px-2 py-1.5 space-y-1">
        <p className="text-[11px] font-semibold text-slate-200 leading-tight break-words">
          {node.component_uuid
            ? <Link to={`/components/${node.component_uuid}`} className="hover:text-cyan-400 transition-colors">{name}</Link>
            : name}
        </p>
        {jmName && (
          <p className="text-[9px] font-mono-sc text-slate-500 flex items-center gap-1">
            <SizeBadge size={jmSize} />
            {jumpModule?.component_uuid
              ? <Link to={`/components/${jumpModule.component_uuid}`} className="hover:text-violet-400 transition-colors">{jmName}</Link>
              : jmName}
          </p>
        )}
        {stats && <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5">{stats}</div>}
      </div>
      {node.manufacturer_code && (
        <div className="px-2 pb-1.5">
          <span className="text-[9px] font-mono-sc text-slate-700">
            {extractMfr(node.component_class_name, node.manufacturer_code)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Shield card
// ─────────────────────────────────────────────

function ShieldCard({ node }: { node: LoadoutNode }) {
  const name   = cleanCompName(node.component_name) ?? '—';
  const hp     = node.shield_hp ? Math.round(parseFloat(String(node.shield_hp))).toLocaleString('en-US') : null;
  const regen  = node.shield_regen ? parseFloat(String(node.shield_regen)).toFixed(1) : null;
  const delay  = node.shield_regen_delay ? parseFloat(String(node.shield_regen_delay)).toFixed(1) : null;

  return (
    <div className="flex flex-col rounded-md border border-blue-900/40 bg-blue-950/10 hover:brightness-110 transition-all overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-blue-900/30">
        <span className="text-[10px] text-blue-400">◈</span>
        <span className="text-[9px] font-mono-sc uppercase tracking-wider text-blue-400 opacity-70 flex-1">Shield</span>
        <SizeBadge size={node.component_size} />
        <GradePill grade={node.grade ?? null} />
      </div>
      <div className="flex-1 px-2 py-1.5 space-y-1">
        <p className="text-[11px] font-semibold text-slate-200 leading-tight break-words">
          {node.component_uuid
            ? <Link to={`/components/${node.component_uuid}`} className="hover:text-cyan-400 transition-colors">{name}</Link>
            : name}
        </p>
        {(hp || regen) && (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5">
            {hp    && <StatPill label="HP"    value={hp}          color="text-blue-400" />}
            {regen && <StatPill label="regen" value={`${regen}/s`} color="text-sky-400" />}
            {delay && <StatPill label="delay" value={`${delay}s`} />}
          </div>
        )}
      </div>
      {node.manufacturer_code && (
        <div className="px-2 pb-1.5">
          <span className="text-[9px] font-mono-sc text-slate-700">
            {extractMfr(node.component_class_name, node.manufacturer_code)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Data processing — slots individuels
// ─────────────────────────────────────────────

const WEAPON_TYPES = new Set([
  'WeaponGun','Weapon','MiningLaser','SalvageHead',
  'TractorBeam','RepairBeam','EMP','QuantumInterdictionGenerator','UtilityWeapon',
]);

interface WeaponSlot { portName: string; mount: LoadoutNode | null; weapon: LoadoutNode | null }
interface RackSlot   { rack: LoadoutNode; missiles: LoadoutNode[] }
interface SystemSlot { node: LoadoutNode; jumpModule: LoadoutNode | null }
interface ThrusterGroup { type: string; size: number | null; count: number; totalThrust: number }

interface ProcessedLoadout {
  weapons:   WeaponSlot[];
  turrets:   LoadoutNode[];
  racks:     RackSlot[];
  shields:   LoadoutNode[];
  systems:   SystemSlot[];
  thrusters: ThrusterGroup[];
  cmDecoys:  Array<{ name: string; count: number }>;
  cmNoises:  Array<{ name: string; count: number }>;
  defaultPaint: string | null;
}

const THRUSTER_ORDER = ['Main','Maneuvering','Retro'];

function processLoadout(nodes: LoadoutNode[]): ProcessedLoadout {
  const weapons:       WeaponSlot[]    = [];
  const turrets:       LoadoutNode[]   = [];
  const racks:         RackSlot[]      = [];
  const shields:       LoadoutNode[]   = [];
  const rawSystems:    SystemSlot[]    = [];
  const rawThrusters:  LoadoutNode[]   = [];
  const cmDecoyMap = new Map<string, number>();
  const cmNoiseMap = new Map<string, number>();
  let defaultPaint: string | null = null;

  for (const node of nodes) {
    if (isNoisyPort(node)) continue;
    const portType = node.port_type;
    const compType = node.component_type;

    if (node.port_name === 'hardpoint_paint' && node.component_name) {
      defaultPaint = node.component_name; continue;
    }
    if (compType === 'Countermeasure' && node.component_uuid) {
      const name = node.component_name ?? 'Unknown';
      const lc = name.toLowerCase();
      if (lc.includes('noise') || lc.includes('flare') || lc.includes('chaff'))
        cmNoiseMap.set(name, (cmNoiseMap.get(name) ?? 0) + 1);
      else
        cmDecoyMap.set(name, (cmDecoyMap.get(name) ?? 0) + 1);
      continue;
    }
    if (portType === 'Turret' && node.component_uuid) {
      turrets.push(node); continue;
    }
    if ((portType === 'Gimbal' || portType === 'WeaponRack') && node.component_uuid) {
      const weapon = node.children.find(c => c.component_type && WEAPON_TYPES.has(c.component_type)) ?? null;
      weapons.push({ portName: node.port_name, mount: node, weapon }); continue;
    }
    if (compType && WEAPON_TYPES.has(compType) && node.component_uuid) {
      weapons.push({ portName: node.port_name, mount: null, weapon: node }); continue;
    }
    if ((portType === 'MissileRack' || compType === 'MissileRack') && node.component_uuid) {
      const missiles = node.children.filter(c =>
        c.component_type === 'Missile' || c.port_type === 'Missile' || (c.port_name ?? '').includes('missile')
      );
      racks.push({ rack: node, missiles }); continue;
    }
    if (compType === 'Shield' && node.component_uuid) { shields.push(node); continue; }
    if (portType === 'Thruster' && compType === 'Thruster' && node.component_uuid) { rawThrusters.push(node); continue; }
    if (portType === 'QuantumDrive' && compType === 'QuantumDrive' && node.component_uuid) {
      const jumpChild = node.children.find(c => {
        const cls = (c.component_class_name ?? '').toUpperCase();
        return cls.startsWith('JDRV') || c.component_type === 'JumpDrive';
      }) ?? null;
      rawSystems.push({ node, jumpModule: jumpChild }); continue;
    }
    if (['Cooler','PowerPlant','Radar'].includes(compType ?? '') && node.component_uuid) {
      rawSystems.push({ node, jumpModule: null }); continue;
    }
  }

  const SYS_ORDER = ['Cooler','PowerPlant','QuantumDrive','Radar'];
  const systems = rawSystems.sort((a,b) => {
    const ai = SYS_ORDER.indexOf(a.node.component_type ?? '');
    const bi = SYS_ORDER.indexOf(b.node.component_type ?? '');
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const thrusterMap = new Map<string, ThrusterGroup>();
  for (const node of rawThrusters) {
    const type   = node.thruster_type ?? 'Main';
    const size   = node.component_size ?? null;
    const thrust = parseFloat(String(node.thruster_max_thrust ?? 0));
    const key    = `${type}|${size}`;
    const ex = thrusterMap.get(key);
    if (ex) { ex.count++; ex.totalThrust += thrust; }
    else thrusterMap.set(key, { type, size, count: 1, totalThrust: thrust });
  }
  const allGrps = Array.from(thrusterMap.values());
  const thrusters = [
    ...THRUSTER_ORDER.flatMap(t => allGrps.filter(g => g.type === t).sort((a,b)=>(b.size??0)-(a.size??0))),
    ...allGrps.filter(g => !THRUSTER_ORDER.includes(g.type)),
  ];

  return {
    weapons, turrets, racks, shields, systems, thrusters,
    cmDecoys: Array.from(cmDecoyMap.entries()).map(([name, count]) => ({ name, count })),
    cmNoises: Array.from(cmNoiseMap.entries()).map(([name, count]) => ({ name, count })),
    defaultPaint,
  };
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function ShipLoadout({ nodes }: { nodes: LoadoutNode[] }) {
  const data = processLoadout(nodes);

  return (
    <div className="space-y-6">

      {/* ── Weapons ── */}
      {data.weapons.length > 0 && (
        <Section title="Weapons & Utilities" accent="text-red-400" count={data.weapons.length}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {data.weapons.map((slot, i) => (
              <WeaponCard key={i} portName={slot.portName} mount={slot.mount} weapon={slot.weapon} />
            ))}
          </div>
        </Section>
      )}

      {/* ── Turrets ── */}
      {data.turrets.length > 0 && (
        <Section title="Turrets" accent="text-amber-400" count={data.turrets.length}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {data.turrets.map((t, i) => (
              <TurretCard key={i} node={t} />
            ))}
          </div>
        </Section>
      )}

      {/* ── Missiles ── */}
      {data.racks.length > 0 && (
        <Section title="Missiles" accent="text-orange-400" count={data.racks.length}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {data.racks.map((slot, i) => (
              <RackCard key={i} rack={slot.rack} missiles={slot.missiles} />
            ))}
          </div>
        </Section>
      )}

      {/* ── Shields ── */}
      {data.shields.length > 0 && (
        <Section title="Shields" accent="text-blue-400" count={data.shields.length}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {data.shields.map((node, i) => (
              <ShieldCard key={i} node={node} />
            ))}
          </div>
        </Section>
      )}

      {/* ── Systems ── */}
      {data.systems.length > 0 && (
        <Section title="Systems" accent="text-violet-400" count={data.systems.length}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {data.systems.map((item, i) => (
              <SystemCard key={i} node={item.node} jumpModule={item.jumpModule} />
            ))}
          </div>
        </Section>
      )}

      {/* ── Thrusters ── */}
      {data.thrusters.length > 0 && (
        <Section title="Thrusters" accent="text-amber-400">
          <div className="flex flex-wrap gap-2">
            {data.thrusters.map((g, i) => (
              <div key={i}
                className="flex items-center gap-2 rounded-md border border-amber-900/30 bg-amber-950/10 px-3 py-1.5"
              >
                {g.size != null && <SizeBadge size={g.size} />}
                <span className="text-xs font-mono-sc text-amber-300">{g.type}</span>
                <span className="text-xs font-mono-sc text-slate-600">x{g.count}</span>
                <span className="text-[10px] font-orbitron text-slate-500 tabular-nums">
                  {toMN(g.totalThrust)} MN
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Countermeasures ── */}
      {(data.cmDecoys.length > 0 || data.cmNoises.length > 0) && (
        <Section title="Countermeasures" accent="text-teal-400">
          <div className="flex flex-wrap gap-2">
            {[...data.cmDecoys, ...data.cmNoises].map((cm, i) => (
              <div key={i}
                className="flex items-center gap-2 rounded-md border border-teal-900/30 bg-teal-950/10 px-3 py-1.5"
              >
                <span className="text-xs text-slate-300">{cm.name}</span>
                <span className="text-xs font-mono-sc text-teal-600">x{cm.count}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Default Paint ── */}
      {data.defaultPaint && (
        <Section title="Default Paint" accent="text-slate-500">
          <span className="text-sm text-slate-400">{data.defaultPaint}</span>
        </Section>
      )}

    </div>
  );
}
