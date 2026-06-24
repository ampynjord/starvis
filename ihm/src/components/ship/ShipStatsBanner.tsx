/**
 * ShipStatsBanner — Bloc stats compact sans onglets
 * Sections : Velocity ruler · Hardpoints · Survival · Systems
 */

import type { LoadoutNode, Ship } from '@/types/api';

// ── Helpers ──────────────────────────────────────────────
function n(v: unknown): number { return Number(v ?? 0) || 0; }
function fV(v: number | null | undefined, dec = 0): string {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return Number(v).toFixed(dec);
}
function fK(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000)      return `${(val / 1000).toFixed(1)}k`;
  return val.toFixed(0);
}

// ── Flatten loadout ──────────────────────────────────────
function flattenNodes(nodes: LoadoutNode[]): LoadoutNode[] {
  const r: LoadoutNode[] = [];
  for (const nd of nodes) {
    r.push(nd);
    if (nd.children.length) r.push(...flattenNodes(nd.children));
  }
  return r;
}

// ── Loadout aggregation ──────────────────────────────────
const HP_ORDER    = ['WeaponGun','Weapon','Gimbal','Turret','MissileRack','Shield','PowerPlant','Cooler','QuantumDrive','Radar'];
const VISUAL_TYPES = new Set(HP_ORDER);
const NOISY       = ['controller','_door','radar_helper','fuel_tank','fuel_intake'];

const HP_LABELS: Record<string, string> = {
  WeaponGun: 'Guns', Weapon: 'Wpns', Gimbal: 'Gimbal', Turret: 'Turret',
  MissileRack: 'Msls', Shield: 'Shield', PowerPlant: 'Power', Cooler: 'Cool',
  QuantumDrive: 'QD', Radar: 'Radar',
};
const HP_STYLES: Record<string, string> = {
  WeaponGun:    'text-red-400     border-red-900/50    bg-red-950/30',
  Weapon:       'text-red-400     border-red-900/50    bg-red-950/30',
  Gimbal:       'text-violet-400  border-violet-900/50 bg-violet-950/30',
  Turret:       'text-amber-400   border-amber-900/50  bg-amber-950/30',
  MissileRack:  'text-orange-400  border-orange-900/50 bg-orange-950/30',
  Shield:       'text-blue-400    border-blue-900/50   bg-blue-950/30',
  PowerPlant:   'text-yellow-400  border-yellow-900/50 bg-yellow-950/30',
  Cooler:       'text-cyan-400    border-cyan-900/50   bg-cyan-950/30',
  QuantumDrive: 'text-violet-400  border-violet-900/50 bg-violet-950/30',
  Radar:        'text-green-400   border-green-900/50  bg-green-950/30',
};

interface LStats {
  powerOutput: number; powerDraw: number;
  heat: number; cooling: number;
  shieldHp: number; totalDps: number;
  hardpoints: { type: string; size: number }[];
}

function computeStats(nodes: LoadoutNode[]): LStats {
  const all = flattenNodes(nodes);
  let powerOutput = 0, powerDraw = 0, heat = 0, cooling = 0, shieldHp = 0, totalDps = 0;
  const hardpoints: { type: string; size: number }[] = [];

  // Accumulate energy/combat stats across all nested components
  for (const nd of all) {
    if (!nd.component_uuid) continue;
    powerOutput += n(nd.power_output);
    powerDraw   += n(nd.power_draw);
    heat        += n(nd.heat_generation);
    cooling     += n(nd.cooling_rate);
    shieldHp    += n(nd.shield_hp);
    totalDps    += n(nd.weapon_dps);
  }

  // Hardpoints: count ROOT-LEVEL slots only (not sub-ports of turrets/gimbals)
  for (const nd of nodes) {
    const pn = nd.port_name.toLowerCase();
    if (NOISY.some(p => pn.includes(p))) continue;
    const type = nd.port_type || '';
    if (type && VISUAL_TYPES.has(type)) {
      hardpoints.push({ type, size: n(nd.component_size ?? nd.port_max_size) || 1 });
    }
  }
  hardpoints.sort((a, b) => {
    const d = HP_ORDER.indexOf(a.type) - HP_ORDER.indexOf(b.type);
    return d !== 0 ? d : b.size - a.size;
  });
  return { powerOutput, powerDraw, heat, cooling, shieldHp, totalDps, hardpoints };
}

// ── Primitives ───────────────────────────────────────────

/** Section separator */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="text-[9px] font-mono-sc text-slate-700 uppercase tracking-[0.2em]">{children}</span>
      <span className="flex-1 h-px bg-slate-800" />
    </div>
  );
}

// ── Component ────────────────────────────────────────────

export function ShipStatsBanner({ ship, loadout, category }: { ship: Ship, loadout: LoadoutNode[], category?: string }) {
  const isGround = category?.toLowerCase().includes('ground') || false;
  const isGroundOrGravlev = category === 'ground' || category === 'gravlev';
  const ls = computeStats(loadout);
  const shieldHp = ls.shieldHp > 0 ? ls.shieldHp : n(ship.shield_hp);
  const hullHp   = n(ship.total_hp);
  const hasPower = ls.powerOutput > 0 || ls.powerDraw > 0;

  // ── G-force ────────────────────────────────────────────
  const allNodes = flattenNodes(loadout);
  const mainThrusters = allNodes.filter(nd =>
    nd.component_type === 'Thruster' &&
    (nd.thruster_type === 'Main' || nd.thruster_type === 'VTOL') &&
    nd.component_uuid,
  );
  const totalThrustN = mainThrusters.reduce((s, nd) => s + n(nd.thruster_max_thrust), 0);
  const gForce = (ship.mass && n(ship.mass) > 0 && totalThrustN > 0)
    ? (totalThrustN / n(ship.mass)) / 9.81
    : null;

  // ── Radar ──────────────────────────────────────────────
  const radarNode = allNodes.find(nd => nd.component_type === 'Radar' && nd.component_uuid) ?? null;

  // ── Quantum Drive ─────────────────────────────────────
  const qdNode = allNodes.find(nd => nd.component_type === 'QuantumDrive' && nd.component_uuid) ?? null;

  // ── Boost angles + ramp (depuis game_data) ────────────
  const gd = ship.game_data as any;
  const ab = gd?.ifcs?.afterburner;
  const abAngMult = ab?.afterburnAngVelocityMultiplier as { x: number; y: number; z: number } | undefined;
  const abAccelMult = ab?.afterburnAccelMultiplierPositive as { x: number; y: number; z: number } | undefined;
  const boostedPitch = (abAngMult && n(ship.pitch_max) > 0) ? n(ship.pitch_max) * abAngMult.x : null;
  const boostedYaw   = (abAngMult && n(ship.yaw_max)   > 0) ? n(ship.yaw_max)   * abAngMult.z : null;
  const boostedRoll  = (abAngMult && n(ship.roll_max)  > 0) ? n(ship.roll_max)  * abAngMult.y : null;
  const rampUp   = ship.boost_ramp_up   ?? (typeof ab?.afterburnerRampUpTime   === 'number' ? ab.afterburnerRampUpTime   : null);
  const rampDown = ship.boost_ramp_down ?? (typeof ab?.afterburnerRampDownTime === 'number' ? ab.afterburnerRampDownTime : null);
  // Boosted acceleration (G)
  const gForceBoost = (abAccelMult && gForce != null) ? gForce * abAccelMult.x : null;

  // ── Velocity ruler ─────────────────────────────────────
  const maxSpeed = Math.max(n(ship.max_speed), n(ship.boost_speed_forward), 500);
  const pctOf = (v: number | null | undefined) =>
    maxSpeed > 0 ? (Math.min(n(v), maxSpeed) / maxSpeed) * 100 : 0;

  // ── Grouped hardpoints ───────────────────────────────────
  const hpGroups = new Map<string, number[]>();
  for (const hp of ls.hardpoints) {
    if (!hpGroups.has(hp.type)) hpGroups.set(hp.type, []);
    hpGroups.get(hp.type)!.push(hp.size);
  }

  // ── Armor resistances ───────────────────────────────────
  const armBars = [
    { k: 'PHY', v: ship.armor_physical,   color: 'bg-slate-400', text: 'text-slate-300' },
    { k: 'NRG', v: ship.armor_energy,     color: 'bg-cyan-500',  text: 'text-cyan-400' },
    { k: 'DST', v: ship.armor_distortion, color: 'bg-violet-500',text: 'text-violet-400' },
  ].filter(a => a.v != null);

  // ── HP stacked ─────────────────────────────────────────
  const totalHp  = shieldHp + hullHp;
  const shdPct   = totalHp > 0 ? (shieldHp / totalHp) * 100 : 0;
  const hullPct  = totalHp > 0 ? (hullHp / totalHp) * 100 : 0;

  return (
    <div className="space-y-5 text-sm">

      {/* ════════════════════════════════════════
          VELOCITY RULER
      ════════════════════════════════════════ */}
      <div>
        <SectionLabel>Velocity</SectionLabel>

        {/* Ruler bar avec marqueurs */}
        <div className="relative h-7 bg-slate-900 rounded-md border border-slate-800 overflow-hidden mb-3">
          {/* gradient de fond */}
          <div className="absolute inset-0 bg-linear-to-r from-slate-900 via-slate-800/20 to-violet-950/30" />

          {/* Remplissage boost fwd */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-amber-500/10 border-r border-amber-500/30"
            style={{ width: `${pctOf(ship.boost_speed_forward)}%` }}
          />

          {/* Tick SCM */}
          {n(ship.scm_speed) > 0 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-cyan-500/70"
              style={{ left: `${pctOf(ship.scm_speed)}%` }}
            >
              <span className="absolute top-0 left-1 text-[9px] font-mono-sc text-cyan-400 whitespace-nowrap">
                {fV(ship.scm_speed)}
              </span>
            </div>
          )}

          {/* Tick Boost Fwd */}
          {n(ship.boost_speed_forward) > 0 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-amber-400/70"
              style={{ left: `${pctOf(ship.boost_speed_forward)}%` }}
            >
              <span className="absolute bottom-0 right-1 text-[9px] font-mono-sc text-amber-400 whitespace-nowrap">
                {fV(ship.boost_speed_forward)}
              </span>
            </div>
          )}

          {/* Tick Nav Max (bord droit) */}
          {n(ship.max_speed) > 0 && (
            <div className="absolute right-1 top-1/2 -translate-y-1/2">
              <span className="text-[9px] font-mono-sc text-violet-400">
                {fV(ship.max_speed)} m/s
              </span>
            </div>
          )}
        </div>

        {/* Legend below the ruler */}
        <div className="flex gap-3 mb-3">
          {(isGround ? [
            { label: 'Max Speed', color: 'bg-cyan-500', value: fV(ship.max_speed) + ' m/s' },
          ] : [
            { label: 'SCM',  color: 'bg-cyan-500',   value: fV(ship.scm_speed) + ' m/s' },
            { label: 'Boost',color: 'bg-amber-400',  value: fV(ship.boost_speed_forward) + ' m/s' },
            { label: 'Ret.', color: 'bg-amber-700',  value: fV(ship.boost_speed_backward ?? 0) + ' m/s' },
            { label: 'Nav',  color: 'bg-violet-500', value: fV(ship.max_speed) + ' m/s' },
          ]).map(({ label, color, value }) => (
            <div key={label} className="flex items-center gap-1 min-w-0">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />
              <span className="text-[9px] font-mono-sc text-slate-600 shrink-0">{label}</span>
              <span className="text-[9px] font-mono-sc text-slate-400 tabular-nums truncate">{value}</span>
            </div>
          ))}
        </div>

        {/* Agility — ships only (default gauge + boost overgauge) */}
        {!isGroundOrGravlev && (
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: 'Pitch', val: ship.pitch_max, boost: boostedPitch, staticMax: 130, color: 'bg-emerald-600' },
              { label: 'Yaw',   val: ship.yaw_max,   boost: boostedYaw,   staticMax: 130, color: 'bg-emerald-600' },
              { label: 'Roll',  val: ship.roll_max,  boost: boostedRoll,  staticMax: 260, color: 'bg-teal-600' },
            ].map(({ label, val, boost, staticMax, color }) => {
              const base = n(val);
              const boostVal = boost != null ? n(boost) : null;
              const hasBoost = boostVal != null && boostVal > base;
              const gaugeMax = Math.max(staticMax, boostVal ?? 0, base);
              const basePct = gaugeMax > 0 ? Math.min(100, (base / gaugeMax) * 100) : 0;
              const boostPct = boostVal != null && gaugeMax > 0 ? Math.min(100, (boostVal / gaugeMax) * 100) : 0;
              return (
                <div key={label} className="flex flex-col items-center gap-1 rounded-md border border-slate-800 bg-slate-900/40 py-2 px-1">
                  <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest">{label}</span>
                  <div className="relative w-3 h-10 bg-slate-800 rounded-full overflow-hidden">
                    {hasBoost && (
                      <div
                        className="absolute inset-x-0 bottom-0 rounded-full bg-amber-500/40"
                        style={{ height: `${boostPct}%` }}
                      />
                    )}
                    <div
                      className={`absolute inset-x-0 bottom-0 rounded-full ${color}`}
                      style={{ height: `${basePct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono-sc text-slate-300 tabular-nums">{fV(val)}°</span>
                  {hasBoost && (
                    <span className="text-[9px] font-mono-sc text-amber-400 tabular-nums">↑{boostVal.toFixed(0)}°</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* G-force + boost — ships uniquement */}
        {!isGroundOrGravlev && gForce != null && (
          <div className="flex items-center justify-between mt-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5">
            <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest">Accel (fwd)</span>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-orbitron font-bold text-amber-400 tabular-nums">{gForce.toFixed(1)} G</span>
              {gForceBoost != null && (
                <span className="text-xs font-orbitron text-amber-600 tabular-nums">↑{gForceBoost.toFixed(1)} G</span>
              )}
            </div>
          </div>
        )}

        {/* Boost ramp — ships only */}
        {!isGroundOrGravlev && rampUp != null && (
          <div className="mt-2">
            <div className="flex flex-col items-center rounded-md border border-amber-900/30 bg-amber-950/10 py-1.5 px-1">
              <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest mb-0.5">Boost Ramp</span>
              <span className="text-[11px] font-orbitron font-bold text-amber-400 tabular-nums">
                ↑{n(rampUp).toFixed(1)}s ↓{n(rampDown).toFixed(1)}s
              </span>
              <span className="text-[9px] font-mono-sc text-slate-700">Up / Down</span>
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════
          FIREPOWER
      ════════════════════════════════════════ */}
      {(ls.totalDps > 0 || (ship.weapon_damage_total != null && Number(ship.weapon_damage_total) > 0) || (ship.missile_damage_total != null && Number(ship.missile_damage_total) > 0)) && (
        <div>
          <SectionLabel>Firepower</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {(ls.totalDps > 0 || (ship.weapon_damage_total != null && Number(ship.weapon_damage_total) > 0)) && (
              <div className="flex flex-col items-center rounded-md border border-red-900/40 bg-red-950/10 py-2 px-1">
                <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest mb-0.5">Weapons DPS</span>
                <span className="text-sm font-orbitron font-bold text-red-400 tabular-nums">
                  {fK(ls.totalDps > 0 ? ls.totalDps : n(ship.weapon_damage_total))}
                </span>
              </div>
            )}
            {ship.missile_damage_total != null && n(ship.missile_damage_total) > 0 && (
              <div className="flex flex-col items-center rounded-md border border-orange-900/40 bg-orange-950/10 py-2 px-1">
                <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest mb-0.5">Missiles</span>
                <span className="text-sm font-orbitron font-bold text-orange-400 tabular-nums">
                  {fK(n(ship.missile_damage_total))}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          HARDPOINTS
      ════════════════════════════════════════ */}
      {hpGroups.size > 0 && (
        <div>
          <SectionLabel>Hardpoints</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {HP_ORDER.filter(t => hpGroups.has(t)).map(type => {
              const sizes = hpGroups.get(type)!;
              const label = HP_LABELS[type] ?? type;
              const style = HP_STYLES[type] ?? 'text-slate-400 border-slate-700 bg-slate-900/40';
              return (
                <div key={type} className="flex items-center gap-1.5">
                  <span className={`text-[8px] font-mono-sc border rounded-sm px-1.5 py-0.5 leading-none shrink-0 w-12 text-center ${style}`}>
                    {label}
                  </span>
                  <div className="flex flex-wrap gap-1 flex-1">
                    {sizes.map((s, i) => (
                      <span key={i} className="text-[8px] font-mono-sc text-slate-500 border border-slate-800 bg-slate-900/40 rounded-sm px-1 py-0.5 leading-none tabular-nums">
                        S{s}
                      </span>
                    ))}
                  </div>
                  <span className="text-[8px] font-mono-sc text-slate-700 shrink-0">×{sizes.length}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          SURVIVAL — HP + ARMOR
      ════════════════════════════════════════ */}
      <div>
        <SectionLabel>Survival</SectionLabel>

        {/* HP stacked bar */}
        {(shieldHp > 0 || hullHp > 0) && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                {shieldHp > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-xs bg-cyan-500" />
                    <span className="text-[10px] font-mono-sc text-cyan-600">Shield</span>
                    <span className="text-[10px] font-mono-sc text-cyan-400 tabular-nums">{fK(shieldHp)} HP</span>
                  </span>
                )}
                {hullHp > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-xs bg-slate-500" />
                    <span className="text-[10px] font-mono-sc text-slate-500">Hull</span>
                    <span className="text-[10px] font-mono-sc text-slate-400 tabular-nums">{fK(hullHp)} HP</span>
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono-sc text-slate-600 tabular-nums">
                Total {fK(totalHp)}
              </span>
            </div>
            {/* Barre stacked */}
            <div className="h-3 bg-slate-800 rounded-full overflow-hidden flex gap-px">
              {shieldHp > 0 && (
                <div className="h-full bg-cyan-600 rounded-l-full" style={{ width: `${shdPct}%` }} />
              )}
              {hullHp > 0 && (
                <div
                  className="h-full bg-slate-500 rounded-r-full"
                  style={{ width: `${hullPct}%` }}
                />
              )}
            </div>
          </div>
        )}

        {/* Shield regen */}
        {(ship.shield_regen != null || ship.shield_regen_delay != null) && (
          <div className="flex items-center gap-1.5 mb-2">
            {ship.shield_regen != null && (
              <div className="flex-1 flex flex-col items-center rounded-md border border-cyan-900/30 bg-cyan-950/10 py-1.5 px-1">
                <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest mb-0.5">Regen</span>
                <span className="text-sm font-orbitron font-bold text-cyan-400 tabular-nums">{Number(ship.shield_regen).toFixed(1)}/s</span>
              </div>
            )}
            {ship.shield_regen_delay != null && (
              <div className="flex-1 flex flex-col items-center rounded-md border border-cyan-900/30 bg-cyan-950/10 py-1.5 px-1">
                <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest mb-0.5">Delay</span>
                <span className="text-sm font-orbitron font-bold text-cyan-400 tabular-nums">{Number(ship.shield_regen_delay).toFixed(1)}s</span>
              </div>
            )}
            {ship.shield_down_delay != null && (
              <div className="flex-1 flex flex-col items-center rounded-md border border-cyan-900/30 bg-cyan-950/10 py-1.5 px-1">
                <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest mb-0.5">Down</span>
                <span className="text-sm font-orbitron font-bold text-cyan-400 tabular-nums">{Number(ship.shield_down_delay).toFixed(1)}s</span>
              </div>
            )}
          </div>
        )}

        {/* Armor HP + durability */}
        {(ship.armor_hp != null || ship.armor_phys_resist != null) && (
          <div className="flex items-center gap-1.5 mb-2">
            {ship.armor_hp != null && (
              <div className="flex-1 flex flex-col items-center rounded-md border border-slate-800 bg-slate-900/40 py-1.5 px-1">
                <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest mb-0.5">Armor HP</span>
                <span className="text-sm font-orbitron font-bold text-orange-400 tabular-nums">{fK(n(ship.armor_hp))}</span>
              </div>
            )}
            {(ship.armor_phys_resist != null || ship.armor_energy_resist != null) && (
              <div className="flex-1 flex flex-col items-center rounded-md border border-slate-800 bg-slate-900/40 py-1.5 px-1">
                <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest mb-0.5">Durability</span>
                <div className="flex gap-1.5 items-baseline">
                  {ship.armor_phys_resist != null && (
                    <span className={`text-[11px] font-orbitron font-bold tabular-nums ${ n(ship.armor_phys_resist) < 1 ? 'text-green-400' : 'text-red-400'}`}>
                      {n(ship.armor_phys_resist) < 1
                        ? `-${((1 - n(ship.armor_phys_resist)) * 100).toFixed(0)}%`
                        : `+${((n(ship.armor_phys_resist) - 1) * 100).toFixed(0)}%`} PHY
                    </span>
                  )}
                  {ship.armor_energy_resist != null && (
                    <span className={`text-[11px] font-orbitron font-bold tabular-nums ${ n(ship.armor_energy_resist) <= 1 ? 'text-green-400' : 'text-red-400'}`}>
                      {n(ship.armor_energy_resist) < 1
                        ? `-${((1 - n(ship.armor_energy_resist)) * 100).toFixed(0)}%`
                        : `+${((n(ship.armor_energy_resist) - 1) * 100).toFixed(0)}%`} NRG
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Armor resistance — 3 blocks side by side */}
        {armBars.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {armBars.map(({ k, v, color, text }) => {
              const pct = Math.round((1 - n(v)) * 100);
              return (
                <div
                  key={k}
                  className="relative flex flex-col items-center rounded-md border border-slate-800 bg-slate-900/40 overflow-hidden py-2.5 px-1"
                >
                  {/* proportional background fill */}
                  <div
                    className={`absolute bottom-0 left-0 right-0 opacity-10 ${color}`}
                    style={{ height: `${pct}%` }}
                  />
                  <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest mb-1 relative">{k}</span>
                  <span className={`text-base font-orbitron font-bold tabular-nums relative ${pct > 0 ? text : 'text-slate-700'}`}>
                    {pct}%
                  </span>
                  <span className="text-[9px] font-mono-sc text-slate-700 relative">reduction</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Damage penetration */}
        {(ship.fuse_penetration != null || ship.component_penetration != null) && (
          <div className="flex items-center justify-between mt-2 rounded-md border border-orange-900/30 bg-orange-950/10 px-3 py-1.5">
            <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest">Penetration</span>
            <div className="flex gap-3 items-baseline">
              {ship.fuse_penetration != null && (
                <span className="text-[11px] font-mono-sc">
                  <span className="text-slate-500">Fuse </span>
                  <span className="font-bold text-orange-400">
                    {((1 - n(ship.fuse_penetration)) * 100) > 0
                      ? `-${((1 - n(ship.fuse_penetration)) * 100).toFixed(0)}%`
                      : `${((1 - n(ship.fuse_penetration)) * 100).toFixed(0)}%`}
                  </span>
                </span>
              )}
              {ship.component_penetration != null && (
                <span className="text-[11px] font-mono-sc">
                  <span className="text-slate-500">Comp </span>
                  <span className="font-bold text-orange-400">
                    {((1 - n(ship.component_penetration)) * 100) > 0
                      ? `-${((1 - n(ship.component_penetration)) * 100).toFixed(0)}%`
                      : `${((1 - n(ship.component_penetration)) * 100).toFixed(0)}%`}
                  </span>
                </span>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ════════════════════════════════════════
          SIGNATURES
      ════════════════════════════════════════ */}
      {(ship.armor_signal_ir != null || ship.armor_signal_em != null || ship.armor_signal_cs != null) && (() => {
        const sigs = [
          { key: 'IR',    label: 'Thermal',  val: ship.armor_signal_ir, color: '#f97316', dimColor: 'text-orange-400', trackColor: 'rgba(234,88,12,0.15)' },
          { key: 'EM',    label: 'Electro',  val: ship.armor_signal_em, color: '#a855f7', dimColor: 'text-violet-400', trackColor: 'rgba(168,85,247,0.15)' },
          { key: 'CS',    label: 'Cross-sec',val: ship.armor_signal_cs, color: '#06b6d4', dimColor: 'text-cyan-400',   trackColor: 'rgba(6,182,212,0.15)'  },
        ].filter(s => s.val != null) as { key: string; label: string; val: number; color: string; dimColor: string; trackColor: string }[];

        // Reference: 1.0 = baseline. Values normally between 0 and 1+
        // (maxVal is ignored as values are already fractions of the reference)

        return (
          <div>
            <SectionLabel>Signatures</SectionLabel>
            <div className="grid grid-cols-3 gap-1.5">
              {sigs.map(({ key, label, val, color, dimColor, trackColor }) => {
                const v = parseFloat(String(val));
                const pct = Math.min(v * 100, 150); // can exceed 1.0
                const pctCapped = Math.min(pct, 100);
                // Color: low = green (discrete), high = red (visible)
                const barColor = pct < 30 ? '#22c55e' : pct < 70 ? '#f59e0b' : '#ef4444';
                const r = 18, cx = 24, cy = 24;
                const startA = -210 * (Math.PI / 180);
                const endA   =  30  * (Math.PI / 180);
                const totalA = endA - startA;
                const fillA  = startA + (pctCapped / 100) * totalA;
                const arcPath = (from: number, to: number) => {
                  const x1 = cx + r * Math.cos(from), y1 = cy + r * Math.sin(from);
                  const x2 = cx + r * Math.cos(to),   y2 = cy + r * Math.sin(to);
                  const large = (to - from) > Math.PI ? 1 : 0;
                  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
                };

                return (
                  <div key={key} className="relative flex flex-col items-center rounded-md border border-slate-800 bg-slate-900/40 overflow-hidden pt-1 pb-2 px-1"
                    style={{ background: `radial-gradient(ellipse at 50% 100%, ${trackColor} 0%, transparent 70%)` }}
                  >
                    <svg viewBox="0 0 48 32" className="w-full" style={{ maxHeight: 40 }}>
                      {/* Track */}
                      <path d={arcPath(startA, endA)}
                        fill="none" stroke="rgba(51,65,85,0.8)" strokeWidth="3.5" strokeLinecap="round" />
                      {/* Fill */}
                      {pct > 0 && (
                        <path d={arcPath(startA, fillA)}
                          fill="none" stroke={barColor} strokeWidth="3.5" strokeLinecap="round" opacity="0.9" />
                      )}
                      {/* Dot central */}
                      <circle cx={cx} cy={cy - 4} r="1.5" fill={color} opacity="0.6" />
                      {/* Key label */}
                      <text x={cx} y={cy + 6} textAnchor="middle" fontSize="7"
                        fontWeight="bold" fontFamily="monospace" fill={color} opacity="0.85">
                        {key}
                      </text>
                    </svg>
                    <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest -mt-0.5">{label}</span>
                    <span className={`text-[11px] font-orbitron font-bold tabular-nums mt-0.5 ${dimColor}`}>
                      ×{v.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ════════════════════════════════════════
          SYSTEMS — Output + Consumption
      ════════════════════════════════════════ */}
      {hasPower && (
        <div>
          <SectionLabel>Systems</SectionLabel>
          {(() => {
            const pwrPct = ls.powerOutput > 0 ? (ls.powerDraw / ls.powerOutput) * 100 : 0;
            const htPct  = ls.cooling > 0 ? (ls.heat / ls.cooling) * 100 : 0;
            const pwrColor = pwrPct > 100 ? 'text-red-400' : pwrPct > 80 ? 'text-amber-400' : 'text-yellow-400';
            const htColor  = htPct  > 100 ? 'text-red-400' : htPct  > 80 ? 'text-amber-400' : 'text-blue-400';
            const pwrDraw = Math.round(ls.powerDraw);
            const pwrOut  = Math.round(ls.powerOutput);
            const htDraw  = Math.round(ls.heat);
            const htCool  = Math.round(ls.cooling);
            return (
              <div className="grid grid-cols-2 gap-2">
                {/* Output */}
                <div className="flex flex-col items-center rounded-md border border-slate-800 bg-slate-900/40 py-2 px-2">
                  <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest mb-1">Output</span>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-base font-orbitron font-bold tabular-nums ${pwrColor}`}>{pwrDraw}</span>
                    <span className="text-[9px] font-mono-sc text-slate-600">/</span>
                    <span className="text-sm font-orbitron font-bold tabular-nums text-slate-400">{pwrOut}</span>
                  </div>
                  <span className="text-[9px] font-mono-sc text-slate-700 mt-0.5">EU</span>
                </div>
                {/* Cooling */}
                {ls.cooling > 0 && (
                  <div className="flex flex-col items-center rounded-md border border-slate-800 bg-slate-900/40 py-2 px-2">
                    <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest mb-1">Heat</span>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-base font-orbitron font-bold tabular-nums ${htColor}`}>{htDraw}</span>
                      <span className="text-[9px] font-mono-sc text-slate-600">/</span>
                      <span className="text-sm font-orbitron font-bold tabular-nums text-slate-400">{htCool}</span>
                    </div>
                    <span className="text-[9px] font-mono-sc text-slate-700 mt-0.5">kW</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ════════════════════════════════════════
          RADAR
      ════════════════════════════════════════ */}
      {!isGroundOrGravlev && radarNode && (
        <div>
          <SectionLabel>Radar</SectionLabel>
          <div className="grid grid-cols-3 gap-1.5">
            <div className="flex flex-col items-center rounded-md border border-green-900/40 bg-green-950/10 py-2 px-1">
              <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest mb-0.5">Range</span>
              <span className="text-sm font-orbitron font-bold text-green-400 tabular-nums">
                {radarNode.radar_range != null ? Math.round(n(radarNode.radar_range) / 1000) : '—'}
              </span>
              <span className="text-[9px] font-mono-sc text-slate-700">km</span>
            </div>
            <div className="flex flex-col items-center rounded-md border border-green-900/40 bg-green-950/10 py-2 px-1">
              <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest mb-0.5">Tracking</span>
              <span className="text-sm font-orbitron font-bold text-green-400 tabular-nums">
                {radarNode.radar_tracking_signal != null ? (n(radarNode.radar_tracking_signal) * 100).toFixed(1) : '—'}
              </span>
              <span className="text-[9px] font-mono-sc text-slate-700">%</span>
            </div>
            <div className="flex flex-col items-center rounded-md border border-green-900/40 bg-green-950/10 py-2 px-1">
              <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest mb-0.5">Ping</span>
              <span className="text-sm font-orbitron font-bold text-green-400 tabular-nums">
                {radarNode.radar_detection_lifetime != null ? n(radarNode.radar_detection_lifetime).toFixed(1) : '—'}
              </span>
              <span className="text-[9px] font-mono-sc text-slate-700">s</span>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          FUEL + CARGO
      ════════════════════════════════════════ */}
      {!isGroundOrGravlev && (ship.hydrogen_fuel_capacity != null || ship.quantum_fuel_capacity != null || qdNode?.qd_range != null) && (
        <div>
          <SectionLabel>Fuel</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {ship.hydrogen_fuel_capacity != null && (
              <div className="flex flex-col items-center rounded-md border border-slate-800 bg-slate-900/40 py-2 px-1">
                <span className="text-[9px] font-mono-sc text-slate-700 uppercase tracking-widest mb-0.5">Hydrogen</span>
                <span className="text-sm font-orbitron font-bold text-sky-400 tabular-nums">
                  {Number(ship.hydrogen_fuel_capacity).toFixed(2)}
                </span>
                <span className="text-[9px] font-mono-sc text-slate-700">SCU</span>
              </div>
            )}
            {ship.quantum_fuel_capacity != null && (
              <div className="flex flex-col items-center rounded-md border border-slate-800 bg-slate-900/40 py-2 px-1">
                <span className="text-[9px] font-mono-sc text-slate-700 uppercase tracking-widest mb-0.5">Quantum</span>
                <span className="text-sm font-orbitron font-bold text-violet-400 tabular-nums">
                  {Number(ship.quantum_fuel_capacity).toFixed(2)}
                </span>
                <span className="text-[9px] font-mono-sc text-slate-700">SCU</span>
              </div>
            )}
          </div>
          {/* QD speed + spool */}
          {qdNode && (n(qdNode.qd_speed ?? 0) > 0 || qdNode.qd_spool_time != null) && (
            <div className="flex items-center justify-between mt-1.5 rounded-md border border-violet-900/30 bg-violet-950/10 px-3 py-1.5">
              <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest">QD Speed</span>
              <div className="flex items-baseline gap-2">
                {n(qdNode.qd_speed ?? 0) > 0 && (
                  <span className="text-sm font-orbitron font-bold text-violet-400 tabular-nums">
                    {(n(qdNode.qd_speed ?? 0) / 1_000_000).toFixed(0)} Mm/s
                  </span>
                )}
                {qdNode.qd_spool_time != null && (
                  <span className="text-xs font-mono-sc text-slate-500">spool {n(qdNode.qd_spool_time).toFixed(1)}s</span>
                )}
              </div>
            </div>
          )}
          {/* QD range */}
          {qdNode?.qd_range != null && n(qdNode.qd_range) > 0 && (
            <div className="flex items-center justify-between mt-1.5 rounded-md border border-violet-900/30 bg-violet-950/10 px-3 py-1.5">
              <div>
                <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest">QD Range</span>
                {qdNode.component_name && (
                  <span className="ml-2 text-[9px] font-mono-sc text-slate-700">{qdNode.component_name}</span>
                )}
              </div>
              <span className="text-sm font-orbitron font-bold text-violet-400 tabular-nums">
                {(n(qdNode.qd_range) / 1_000_000_000).toFixed(2)} GM
              </span>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
