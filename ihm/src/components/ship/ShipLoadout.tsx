/**
 * ShipLoadout — Layout carte inspiré erkul.games
 * Chaque port est une carte individuelle, stats inline par type.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LoadoutNode, ShipModule } from '@/types/api';

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

// ─────────────────────────────────────────────
// Weapon card
// ─────────────────────────────────────────────

const WEAPON_TYPE_LABELS: Record<string, string> = {
  WeaponGun: '', MiningLaser: 'Mining', SalvageHead: 'Salvage',
  TractorBeam: 'Tractor', RepairBeam: 'Repair',
  EMP: 'EMP', QuantumInterdictionGenerator: 'QED', UtilityWeapon: 'Utility',
};

const DMGTYPE_SHORT: Record<string, { label: string; color: string }> = {
  energy:      { label: 'Laser',    color: 'text-red-400 border-red-900/60 bg-red-950/30' },
  physical:    { label: 'Ballistic',color: 'text-amber-400 border-amber-900/60 bg-amber-950/30' },
  distortion:  { label: 'Distortion',color: 'text-violet-400 border-violet-900/60 bg-violet-950/30' },
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
  const ammo = (weapon?.weapon_ammo_count != null && weapon.weapon_ammo_count > 0) ? weapon.weapon_ammo_count : null;
  const pwr  = (weapon?.power_draw || mount?.power_draw) ? Math.round(parseFloat(String(weapon?.power_draw ?? mount?.power_draw))).toString() : null;
  const dmgTypeRaw = weapon?.weapon_damage_type ?? null;
  const dmgTypeInfo = dmgTypeRaw ? (DMGTYPE_SHORT[dmgTypeRaw] ?? { label: dmgTypeRaw, color: 'text-slate-400 border-slate-700 bg-slate-900' }) : null;
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
          {dmgTypeInfo && (
            <span className={`text-[8px] font-mono-sc border rounded px-1 py-0.5 leading-none ${dmgTypeInfo.color}`}>
              {dmgTypeInfo.label}
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
        {(dps || dmg || fr || rng || ammo) && (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5">
            {dps  && <StatPill label="DPS"  value={dps}        color="text-red-400" />}
            {dmg  && <StatPill label="dmg"  value={dmg}        color="text-orange-400" />}
            {fr   && <StatPill label="rpm"  value={fr} />}
            {rng  && <StatPill label="rng"  value={`${rng}m`} />}
            {ammo && <StatPill label="ammo" value={ammo}       color="text-amber-300" />}
          </div>
        )}
      </div>

      {/* Footer: grade + mfr + pipes */}
      <div className="flex items-center justify-between px-2 pb-1.5 gap-1">
        <span className="text-[9px] font-mono-sc text-slate-700">
          {extractMfr(weapon?.component_class_name, weapon?.manufacturer_code)}
        </span>
        <div className="flex items-center gap-1.5">
          {pwr && (
            <span className="text-[8px] font-mono-sc text-yellow-600 tabular-nums">{pwr}⚡</span>
          )}
          {weapon?.grade && <GradePill grade={weapon.grade ?? null} />}
        </div>
      </div>
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
                c => c.component_type && ALL_WEAPON_TYPES.has(c.component_type),
              ) ?? null;
              const weaponName = cleanCompName(weapon?.component_name);
              const slotSize   = g.component_size ?? g.port_max_size;
              const dps   = weapon?.weapon_dps    ? Math.round(parseFloat(String(weapon.weapon_dps))) : null;
              const dmg   = weapon?.weapon_damage ? Math.round(parseFloat(String(weapon.weapon_damage))) : null;
              const fr    = weapon?.weapon_fire_rate ? Math.round(parseFloat(String(weapon.weapon_fire_rate))) : null;
              const rng   = weapon?.weapon_range  ? Math.round(parseFloat(String(weapon.weapon_range))) : null;
              const ammo  = (weapon?.weapon_ammo_count != null && weapon.weapon_ammo_count > 0) ? weapon.weapon_ammo_count : null;
              const pwr   = weapon?.power_draw     ? Math.round(parseFloat(String(weapon.power_draw))) : null;
              const dmgTypeRaw  = weapon?.weapon_damage_type ?? null;
              const dmgTypeInfo = dmgTypeRaw ? (DMGTYPE_SHORT[dmgTypeRaw] ?? null) : null;
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
                    {dmgTypeInfo && (
                      <span className={`text-[7px] font-mono-sc border rounded px-1 leading-tight flex-shrink-0 ${dmgTypeInfo.color}`}>{dmgTypeInfo.label}</span>
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
                    {pwr != null && <span className="text-[8px] font-mono-sc text-yellow-600 tabular-nums flex-shrink-0">{pwr}⚡</span>}
                  </div>
                  {/* Stats arme */}
                  {(dps != null || dmg != null || fr != null || rng != null || ammo != null) && (
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 pl-3">
                      {dps  != null && <StatPill label="DPS"  value={dps.toLocaleString('en-US')} color="text-red-400" />}
                      {dmg  != null && <StatPill label="dmg"  value={dmg}   color="text-orange-400" />}
                      {fr   != null && <StatPill label="rpm"  value={fr} />}
                      {rng  != null && <StatPill label="rng"  value={`${rng}m`} />}
                      {ammo != null && <StatPill label="ammo" value={ammo}  color="text-amber-300" />}
                    </div>
                  )}
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
    stats = <StatPill label="output" value={`${parseFloat(String(node.power_output)).toFixed(0)} eu`} color={accent.text} />;
  } else if (t === 'QuantumDrive' && node.qd_speed) {
    const speed = parseFloat(String(node.qd_speed));
    stats = (
      <>
        <StatPill label="speed" value={`${(speed/1e6).toFixed(0)}Mm/s`} color={accent.text} />
        {node.qd_spool_time && <StatPill label="spool" value={`${parseFloat(String(node.qd_spool_time)).toFixed(1)}s`} />}
      </>
    );
  } else if (t === 'Radar') {
    stats = (
      <>
        {node.radar_range && <StatPill label="range"    value={`${Math.round(parseFloat(String(node.radar_range))/1000)}km`} color={accent.text} />}
        {node.radar_tracking_signal && <StatPill label="track" value={parseFloat(String(node.radar_tracking_signal)).toFixed(2)} />}
        {node.radar_detection_lifetime && <StatPill label="ttl" value={`${parseFloat(String(node.radar_detection_lifetime)).toFixed(1)}s`} />}
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
      {(node.manufacturer_code || node.power_draw) && (
        <div className="flex items-center justify-between px-2 pb-1.5">
          <span className="text-[9px] font-mono-sc text-slate-700">
            {extractMfr(node.component_class_name, node.manufacturer_code)}
          </span>
          {node.power_draw && (
            <span className="text-[8px] font-mono-sc text-yellow-600 tabular-nums">
              {Math.round(parseFloat(String(node.power_draw)))}⚡
            </span>
          )}
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
      {(node.manufacturer_code || node.power_draw) && (
        <div className="flex items-center justify-between px-2 pb-1.5">
          <span className="text-[9px] font-mono-sc text-slate-700">
            {extractMfr(node.component_class_name, node.manufacturer_code)}
          </span>
          {node.power_draw && (
            <span className="text-[8px] font-mono-sc text-yellow-600 tabular-nums">
              {Math.round(parseFloat(String(node.power_draw)))}⚡
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Data processing — slots individuels
// ─────────────────────────────────────────────

// Armes de combat (WeaponGun, EMP, QIG...)
const WEAPON_TYPES = new Set([
  'WeaponGun','Weapon','EMP','QuantumInterdictionGenerator','UtilityWeapon',
]);
// Outils utilitaires (mining, salvage, tractor, repair)
const UTILITY_TYPES = new Set([
  'MiningLaser','SalvageHead','TractorBeam','RepairBeam',
]);
// Tous types d'armes/outils (pour chercher dans les enfants)
const ALL_WEAPON_TYPES = new Set([...WEAPON_TYPES, ...UTILITY_TYPES]);

interface WeaponSlot { portName: string; mount: LoadoutNode | null; weapon: LoadoutNode | null }
interface RackSlot   { rack: LoadoutNode; missiles: LoadoutNode[] }
interface SystemSlot { node: LoadoutNode; jumpModule: LoadoutNode | null }
interface ThrusterGroup { type: string; size: number | null; count: number; totalThrust: number }
interface CMEntry { name: string; count: number; ammoPerUnit: number | null; uuid: string | null }

interface ModuleEntry {
  moduleInfo: ShipModule | null;
  node: LoadoutNode;
  subLoadout: ProcessedLoadout;
  slotOptions: ShipModule[];
}

interface ProcessedLoadout {
  weapons:      WeaponSlot[];
  weapTurrets:  LoadoutNode[];  // tourelles classées « armes »
  utilities:    LoadoutNode[];  // tourelles/montages classés « utilitaires »
  racks:        RackSlot[];
  shields:      LoadoutNode[];
  systems:      SystemSlot[];
  thrusters:    ThrusterGroup[];
  cmDecoys:     CMEntry[];
  cmNoises:     CMEntry[];
  defaultPaint: string | null;
  moduleEntries: ModuleEntry[];
}

/** Détermine si un nœud (tourelle ou child) est une arme de combat */
function classifyTurretNode(turret: LoadoutNode): 'weapon' | 'utility' {
  // Parcourir les enfants (gimbals) et leurs enfants (armes)
  for (const child of turret.children ?? []) {
    const ct = child.component_type;
    if (ct) {
      if (WEAPON_TYPES.has(ct)) return 'weapon';
      if (UTILITY_TYPES.has(ct)) return 'utility';
    }
    for (const sub of child.children ?? []) {
      const st = sub.component_type;
      if (st) {
        if (WEAPON_TYPES.has(st)) return 'weapon';
        if (UTILITY_TYPES.has(st)) return 'utility';
      }
    }
  }
  return 'weapon'; // par défaut: arme
}

const THRUSTER_ORDER = ['Main','Maneuvering','Retro'];

/**
 * The loadout_json stored in ship_modules uses camelCase keys (portName, componentClassName…)
 * whereas LoadoutNode / processLoadout expects snake_case (port_name, component_class_name…).
 * This function normalises both formats so processLoadout can handle module sub-trees.
 */
function normalizeModuleNode(raw: Record<string, unknown>): LoadoutNode {
  const className = ((raw.componentClassName ?? raw.component_class_name) ?? null) as string | null;
  const children = Array.isArray(raw.children)
    ? (raw.children as Record<string, unknown>[]).map(normalizeModuleNode)
    : [];
  return {
    id: 0,
    port_name:    ((raw.portName  ?? raw.port_name)  ?? '') as string,
    port_type:    ((raw.portType  ?? raw.port_type)  ?? '') as string,
    port_min_size: ((raw.minSize  ?? raw.port_min_size) ?? null) as number | null,
    port_max_size: ((raw.maxSize  ?? raw.port_max_size) ?? null) as number | null,
    parent_id: null,
    // Use class name as a stand-in uuid so processLoadout's "is port filled?" guards pass
    component_uuid:       className,
    component_name:       null,
    // Derive component_type from portType so rack/missile/shield categorisation works
    component_type:       ((raw.portType ?? raw.port_type) ?? null) as string | null,
    component_size:       ((raw.maxSize  ?? raw.port_max_size) ?? null) as number | null,
    component_class_name: className,
    sub_type: null, grade: null, manufacturer_code: null,
    weapon_dps: null, weapon_damage: null, weapon_fire_rate: null, weapon_range: null,
    weapon_ammo_count: null, weapon_damage_type: null,
    shield_hp: null, shield_regen: null, shield_regen_delay: null,
    qd_speed: null, qd_spool_time: null, qd_range: null,
    power_output: null, power_draw: null, power_base: null, heat_generation: null, cooling_rate: null,
    thruster_max_thrust: null, thruster_type: null,
    rack_count: null, rack_missile_size: null,
    missile_damage: null, missile_signal_type: null,
    cm_ammo_count: null,
    radar_range: null, radar_detection_lifetime: null, radar_tracking_signal: null,
    children,
  };
}

function processLoadout(nodes: LoadoutNode[], activeModules: ShipModule[] = [], moduleSlots: ShipModule[][] = []): ProcessedLoadout {
  const weapons:       WeaponSlot[]    = [];
  const weapTurrets:   LoadoutNode[]   = [];  // tourelles combat
  const utilities:     LoadoutNode[]   = [];  // tourelles utilitaires
  const racks:         RackSlot[]      = [];
  const shields:       LoadoutNode[]   = [];
  const rawSystems:    SystemSlot[]    = [];
  const rawThrusters:  LoadoutNode[]   = [];
  const moduleEntries: ModuleEntry[]   = [];
  const cmDecoyMap = new Map<string, CMEntry>();
  const cmNoiseMap = new Map<string, CMEntry>();
  let defaultPaint: string | null = null;

  const moduleSlotNames = new Set(activeModules.map(m => m.slot_name));

  for (const node of nodes) {
    if (isNoisyPort(node)) continue;
    const portType = node.port_type;
    const compType = node.component_type;

    // Module slots (baies modulaires — Retaliator front/rear, Apollo left/right)
    if (moduleSlotNames.has(node.port_name)) {
      const info = activeModules.find(m => m.slot_name === node.port_name) ?? null;
      // Normalise loadout_json (camelCase from DB) to snake_case LoadoutNode before processing
      const rawSub = info?.loadout_json ?? null;
      const subNodes: LoadoutNode[] = rawSub
        ? (rawSub as unknown as Record<string, unknown>[]).map(normalizeModuleNode)
        : (node.children ?? []);
      const subLoadout = processLoadout(subNodes);
      const slotOptions = moduleSlots.find(slot => slot[0]?.slot_name === node.port_name) ?? [];
      moduleEntries.push({ moduleInfo: info, node, subLoadout, slotOptions });
      continue;
    }

    if (node.port_name === 'hardpoint_paint' && node.component_name) {
      defaultPaint = node.component_name; continue;
    }
    if (compType === 'Countermeasure' && node.component_uuid) {
      const name = node.component_name ?? 'Unknown';
      const lc = name.toLowerCase();
      const ammo = node.cm_ammo_count ?? null;
      const map = (lc.includes('noise') || lc.includes('flare') || lc.includes('chaff')) ? cmNoiseMap : cmDecoyMap;
      const ex = map.get(name);
      if (ex) ex.count++;
      else map.set(name, { name, count: 1, ammoPerUnit: ammo, uuid: node.component_uuid });
      continue;
    }
    if (portType === 'Turret' && node.component_uuid) {
      const cat = classifyTurretNode(node);
      if (cat === 'utility') utilities.push(node);
      else weapTurrets.push(node);
      continue;
    }
    if ((portType === 'Gimbal' || portType === 'WeaponRack') && node.component_uuid) {
      const weapon = node.children.find(c => c.component_type && ALL_WEAPON_TYPES.has(c.component_type)) ?? null;
      const wt = weapon?.component_type;
      if (wt && UTILITY_TYPES.has(wt)) {
        // montage gimbal utilitaire → utilities
        utilities.push(node);
      } else {
        weapons.push({ portName: node.port_name, mount: node, weapon });
      }
      continue;
    }
    if (compType && WEAPON_TYPES.has(compType) && node.component_uuid) {
      weapons.push({ portName: node.port_name, mount: null, weapon: node }); continue;
    }
    if (compType && UTILITY_TYPES.has(compType) && node.component_uuid) {
      // arme utilitaire directe → utilities (on la wrappe dans un WeaponSlot fictif)
      utilities.push(node); continue;
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
    weapons, weapTurrets, utilities, racks, shields, systems, thrusters,
    cmDecoys: Array.from(cmDecoyMap.values()),
    cmNoises: Array.from(cmNoiseMap.values()),
    defaultPaint,
    moduleEntries,
  };
}

// ─────────────────────────────────────────────
// Module card (baies modulaires — Retaliator, Apollo)
// ─────────────────────────────────────────────

function cleanSlotDisplayName(name: string | null | undefined, portName: string): string {
  if (name) return name;
  return portName
    .replace(/^hardpoint_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

const SLOT_TYPE_STYLE: Record<string, string> = {
  front:  'text-cyan-300  border-cyan-800/60  bg-cyan-950/40',
  rear:   'text-indigo-300 border-indigo-800/60 bg-indigo-950/40',
  left:   'text-teal-300  border-teal-800/60  bg-teal-950/40',
  right:  'text-sky-300   border-sky-800/60   bg-sky-950/40',
};

function ModuleCard({ entry, onModuleChange }: {
  entry: ModuleEntry;
  onModuleChange?: (slotName: string, className: string) => void;
}) {
  const info     = entry.moduleInfo;
  const sub      = entry.subLoadout;
  const slotLabel  = cleanSlotDisplayName(info?.slot_display_name, entry.node.port_name);
  const moduleName = info?.module_name ?? entry.node.component_class_name ?? 'Unknown Module';
  const tier       = info?.module_tier;
  const slotType   = info?.slot_type?.toLowerCase();
  const slotStyle  = slotType ? (SLOT_TYPE_STYLE[slotType] ?? 'text-cyan-300 border-cyan-800/60 bg-cyan-950/40') : null;

  const hasTiers = entry.slotOptions.some(m => m.module_tier !== null);
  const sortedOptions = hasTiers
    ? [...entry.slotOptions].sort((a, b) => (a.module_tier ?? 0) - (b.module_tier ?? 0))
    : entry.slotOptions;

  // Strip common word-prefix among all options for compact labels (e.g. "Retaliator Module Front Bomber" → "Bomber")
  const allModuleNames = entry.slotOptions.map(m => m.module_name ?? m.module_class_name ?? '');
  function shortLabel(m: ShipModule): string {
    if (hasTiers) return `T${m.module_tier}`;
    const name = m.module_name ?? m.module_class_name ?? '';
    if (allModuleNames.length <= 1) return name;
    const words = name.split(' ');
    const allWords = allModuleNames.map(n => n.split(' '));
    let shared = 0;
    for (let i = 0; i < words.length - 1; i++) {
      if (allWords.every(ws => ws[i] === words[i])) shared = i + 1;
      else break;
    }
    return words.slice(shared).join(' ') || name;
  }

  const hasWeapons = sub.weapons.length > 0 || sub.weapTurrets.length > 0;
  const hasRacks   = sub.racks.length > 0;
  const hasSystems = sub.systems.length > 0;
  const hasContent = hasWeapons || hasRacks || hasSystems;

  // Fallback: items from the active loadout source that weren't categorised (e.g. Apollo medical beds)
  const subNodes = entry.moduleInfo?.loadout_json ?? entry.node.children ?? [];
  const uncategorized = !hasContent
    ? subNodes.filter(c => c.component_uuid && c.component_name)
    : [];

  return (
    <div className="flex flex-col rounded-md border border-purple-900/40 bg-purple-950/10 hover:border-purple-800/50 transition-all overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-2.5 pt-2 pb-1.5 bg-purple-950/20 border-b border-purple-900/30">
        {slotStyle && (
          <span className={`text-[8px] font-mono-sc uppercase border rounded px-1.5 py-0.5 leading-none ${slotStyle}`}>
            {slotType}
          </span>
        )}
        <span className="text-[10px] font-mono-sc text-purple-300/80 flex-1 truncate">{slotLabel}</span>
        {tier != null && (
          <span className="text-[8px] font-mono-sc text-purple-200 bg-purple-800/40 border border-purple-700/50 rounded px-1.5 py-0.5 leading-none">
            T{tier}
          </span>
        )}
      </div>

      {/* Module selector */}
      {sortedOptions.length > 1 ? (
        <div className="px-2.5 py-2 flex flex-wrap gap-1.5">
          {sortedOptions.map((m) => {
            const isActive = m.module_class_name === info?.module_class_name;
            return (
              <button
                key={m.module_class_name}
                type="button"
                onClick={() => onModuleChange?.(m.slot_name, m.module_class_name)}
                className={[
                  'px-2 py-0.5 text-[9px] font-mono-sc rounded border transition-colors',
                  isActive
                    ? 'bg-purple-900/50 border-purple-500 text-purple-200'
                    : 'bg-slate-900/40 border-slate-700 text-slate-400 hover:border-purple-700 hover:text-purple-300',
                ].join(' ')}
              >
                {shortLabel(m)}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="px-2.5 py-2">
          <p className="text-[11px] font-semibold text-slate-200 leading-tight break-words">{moduleName}</p>
        </div>
      )}

      {/* Active module name (when selector shown) */}
      {sortedOptions.length > 1 && (
        <div className="px-2.5 pb-1.5 -mt-1">
          <p className="text-[11px] font-semibold text-slate-200 leading-tight break-words">{moduleName}</p>
        </div>
      )}

      {/* Sub-components from loadout tree */}
      {hasContent && (
        <div className="px-2.5 pb-2.5 pt-1 space-y-2 border-t border-purple-900/20">
          {hasWeapons && (
            <div>
              <p className="text-[8px] font-mono-sc text-red-400/60 uppercase tracking-wider mb-1.5">Weapons</p>
              <div className="grid grid-cols-2 gap-1.5">
                {sub.weapons.map((slot, i) => (
                  <WeaponCard key={i} portName={slot.portName} mount={slot.mount} weapon={slot.weapon} />
                ))}
                {sub.weapTurrets.map((t, i) => <TurretCard key={`t${i}`} node={t} />)}
              </div>
            </div>
          )}
          {hasRacks && (
            <div>
              <p className="text-[8px] font-mono-sc text-orange-400/60 uppercase tracking-wider mb-1.5">Ordnance</p>
              <div className="grid grid-cols-2 gap-1.5">
                {sub.racks.map((r, i) => <RackCard key={i} rack={r.rack} missiles={r.missiles} />)}
              </div>
            </div>
          )}
          {hasSystems && (
            <div>
              <p className="text-[8px] font-mono-sc text-violet-400/60 uppercase tracking-wider mb-1.5">Systems</p>
              <div className="grid grid-cols-2 gap-1.5">
                {sub.systems.map((item, i) => (
                  <SystemCard key={i} node={item.node} jumpModule={item.jumpModule} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Raw fallback for uncategorised sub-components */}
      {uncategorized.length > 0 && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-purple-900/20 space-y-1">
          {uncategorized.map((c, i) => (
            <p key={i} className="text-[10px] font-mono-sc text-slate-400">
              {c.component_uuid
                ? <Link to={`/components/${c.component_uuid}`} className="hover:text-cyan-400 transition-colors">{cleanCompName(c.component_name)}</Link>
                : cleanCompName(c.component_name)}
            </p>
          ))}
        </div>
      )}

      {!hasContent && uncategorized.length === 0 && subNodes.length === 0 && (
        <div className="px-2.5 pb-2.5">
          <p className="text-[9px] font-mono-sc text-slate-700 italic">— no sub-components —</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function ShipLoadout({
  nodes,
  activeModules = [],
  moduleSlots = [],
  onModuleChange,
}: {
  nodes: LoadoutNode[];
  activeModules?: ShipModule[];
  moduleSlots?: ShipModule[][];
  onModuleChange?: (slotName: string, className: string) => void;
}) {
  const data = processLoadout(nodes, activeModules, moduleSlots);

  // ── Tabs ─────────────────────────────────────────────────
  type TabKey = 'weapons' | 'ordnance' | 'shields' | 'systems' | 'countermeasures' | 'modules' | 'paint';
  interface TabDef { key: TabKey; label: string; count: number }
  const allTabs: TabDef[] = ([
    { key: 'weapons' as TabKey,         label: 'Weapons & Utility', count: data.weapons.length + data.weapTurrets.length + data.utilities.length },
    { key: 'ordnance' as TabKey,        label: 'Ordnance',          count: data.racks.length },
    { key: 'shields' as TabKey,         label: 'Shields',           count: data.shields.length },
    { key: 'systems' as TabKey,         label: 'Systems',           count: data.systems.length + data.thrusters.length },
    { key: 'countermeasures' as TabKey, label: 'Countermeasures',   count: data.cmDecoys.length + data.cmNoises.length },
    { key: 'modules' as TabKey,         label: 'Modules',           count: data.moduleEntries.length },
    { key: 'paint' as TabKey,           label: 'Paint',             count: data.defaultPaint ? 1 : 0 },
  ] as TabDef[]).filter(t => t.count > 0);

  const [activeTab, setActiveTab] = useState<TabKey>(() => (allTabs[0]?.key ?? 'weapons') as TabKey);
  const validTab: TabKey = allTabs.some(t => t.key === activeTab) ? activeTab : ((allTabs[0]?.key ?? 'weapons') as TabKey);

  if (allTabs.length === 0) return null;

  return (
    <div>
      {/* ── Tab bar ── */}
      <div className="flex flex-wrap gap-1 border-b border-slate-800/60 pb-3 mb-5 overflow-x-auto">
        {allTabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={[
              'flex items-center gap-1.5 px-3 py-1 text-[10px] font-mono-sc rounded border transition-colors whitespace-nowrap',
              validTab === tab.key
                ? 'bg-cyan-950/40 border-cyan-700/50 text-cyan-300'
                : 'bg-slate-900/40 border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300',
            ].join(' ')}
          >
            {tab.label}
            <span className={`text-[8px] rounded px-1 py-0.5 leading-none font-bold ${
              validTab === tab.key ? 'bg-cyan-800/50 text-cyan-400' : 'bg-slate-800 text-slate-600'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}

      {/* Weapons & Utility */}
      {validTab === 'weapons' && (
        <div className="space-y-5">
          {(data.weapons.length > 0 || data.weapTurrets.length > 0) && (
            <div>
              <p className="text-[9px] font-mono-sc text-red-400/70 uppercase tracking-wider mb-3">Weapons</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {data.weapons.map((slot, i) => (
                  <WeaponCard key={i} portName={slot.portName} mount={slot.mount} weapon={slot.weapon} />
                ))}
                {data.weapTurrets.map((t, i) => (
                  <TurretCard key={`t${i}`} node={t} />
                ))}
              </div>
            </div>
          )}
          {data.utilities.length > 0 && (
            <div>
              <p className="text-[9px] font-mono-sc text-teal-400/70 uppercase tracking-wider mb-3">Utility</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {data.utilities.map((node, i) => {
                  if (node.port_type === 'Turret') return <TurretCard key={i} node={node} />;
                  const weapon = node.children?.find(c => c.component_type && ALL_WEAPON_TYPES.has(c.component_type)) ?? null;
                  return <WeaponCard key={i} portName={node.port_name} mount={node} weapon={weapon} />;
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ordnance */}
      {validTab === 'ordnance' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {data.racks.map((slot, i) => (
            <RackCard key={i} rack={slot.rack} missiles={slot.missiles} />
          ))}
        </div>
      )}

      {/* Shields */}
      {validTab === 'shields' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {data.shields.map((node, i) => (
            <ShieldCard key={i} node={node} />
          ))}
        </div>
      )}

      {/* Systems + Thrusters */}
      {validTab === 'systems' && (
        <div className="space-y-5">
          {data.systems.length > 0 && (
            <div>
              <p className="text-[9px] font-mono-sc text-violet-400/70 uppercase tracking-wider mb-3">Systems</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {data.systems.map((item, i) => (
                  <SystemCard key={i} node={item.node} jumpModule={item.jumpModule} />
                ))}
              </div>
            </div>
          )}
          {data.thrusters.length > 0 && (
            <div>
              <p className="text-[9px] font-mono-sc text-amber-400/70 uppercase tracking-wider mb-3">Thrusters</p>
              <div className="flex flex-wrap gap-2">
                {data.thrusters.map((g, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-amber-900/30 bg-amber-950/10 px-3 py-1.5">
                    {g.size != null && <SizeBadge size={g.size} />}
                    <span className="text-xs font-mono-sc text-amber-300">{g.type}</span>
                    <span className="text-xs font-mono-sc text-slate-600">x{g.count}</span>
                    <span className="text-[10px] font-orbitron text-slate-500 tabular-nums">{toMN(g.totalThrust)} MN</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Countermeasures */}
      {validTab === 'countermeasures' && (
        <div className="flex flex-wrap gap-2">
          {[...data.cmDecoys, ...data.cmNoises].map((cm, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border border-teal-900/30 bg-teal-950/10 px-3 py-1.5">
              <span className="text-xs text-slate-300">{cm.name}</span>
              <span className="text-xs font-mono-sc text-teal-600">x{cm.count}</span>
              {cm.ammoPerUnit != null && (
                <span className="text-[9px] font-mono-sc text-slate-500 tabular-nums">{cm.ammoPerUnit * cm.count} shots</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modules */}
      {validTab === 'modules' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.moduleEntries.map((entry, i) => (
            <ModuleCard key={i} entry={entry} onModuleChange={onModuleChange} />
          ))}
        </div>
      )}

      {/* Paint */}
      {validTab === 'paint' && (
        <p className="text-sm text-slate-400">{data.defaultPaint}</p>
      )}
    </div>
  );
}
