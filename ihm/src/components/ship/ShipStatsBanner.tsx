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
  for (const nd of all) {
    if (!nd.component_uuid) continue;
    powerOutput += n(nd.power_output);
    powerDraw   += n(nd.power_draw);
    heat        += n(nd.heat_generation);
    cooling     += n(nd.cooling_rate);
    shieldHp    += n(nd.shield_hp);
    totalDps    += n(nd.weapon_dps);
    const pn = nd.port_name.toLowerCase();
    if (NOISY.some(p => pn.includes(p))) continue;
    const type = nd.port_type || nd.component_type || '';
    if (VISUAL_TYPES.has(type)) {
      hardpoints.push({ type, size: n(nd.component_size ?? nd.port_max_size) || 1 });
    }
  }
  hardpoints.sort((a, b) => {
    const d = HP_ORDER.indexOf(a.type) - HP_ORDER.indexOf(b.type);
    return d !== 0 ? d : b.size - a.size;
  });
  return { powerOutput, powerDraw, heat, cooling, shieldHp, totalDps, hardpoints };
}

// ── HP type colors ───────────────────────────────────────
const TYPE_STYLE: Record<string, { badge: string; row: string; label: string }> = {
  WeaponGun:    { badge: 'bg-amber-500 text-amber-950',   row: 'text-amber-400',    label: 'Gun' },
  Weapon:       { badge: 'bg-amber-500 text-amber-950',   row: 'text-amber-400',    label: 'Weapon' },
  Gimbal:       { badge: 'bg-amber-400 text-amber-950',   row: 'text-amber-300',    label: 'Gimbal' },
  Turret:       { badge: 'bg-amber-600 text-amber-100',   row: 'text-amber-300',    label: 'Turret' },
  MissileRack:  { badge: 'bg-orange-500 text-orange-950', row: 'text-orange-400',   label: 'Missile' },
  Shield:       { badge: 'bg-cyan-500 text-cyan-950',     row: 'text-cyan-400',     label: 'Shield' },
  PowerPlant:   { badge: 'bg-yellow-400 text-yellow-950', row: 'text-yellow-400',   label: 'Power' },
  Cooler:       { badge: 'bg-blue-500 text-white',        row: 'text-blue-400',     label: 'Cooler' },
  QuantumDrive: { badge: 'bg-violet-500 text-white',      row: 'text-violet-400',   label: 'QD' },
  Radar:        { badge: 'bg-indigo-500 text-white',      row: 'text-indigo-400',   label: 'Radar' },
};
const DEF_STYLE = { badge: 'bg-slate-700 text-slate-200', row: 'text-slate-500', label: 'Other' };

// ── Primitives ───────────────────────────────────────────

/** Séparateur section */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="text-[9px] font-mono-sc text-slate-700 uppercase tracking-[0.2em]">{children}</span>
      <span className="flex-1 h-px bg-slate-800" />
    </div>
  );
}

/** Ligne stat : label · barre · valeur */
function StatRow({
  label, value, pct, color, accent,
}: { label: string; value: string; pct: number; color: string; accent?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[10px] font-mono-sc w-16 shrink-0 ${accent ?? 'text-slate-500'}`}>{label}</span>
      <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-[10px] font-mono-sc text-slate-300 w-14 text-right tabular-nums">{value}</span>
    </div>
  );
}

// ── Component ────────────────────────────────────────────
interface Props { ship: Ship; loadout: LoadoutNode[] }

export function ShipStatsBanner({ ship, loadout }: Props) {
  const ls = computeStats(loadout);
  const shieldHp = ls.shieldHp > 0 ? ls.shieldHp : n(ship.shield_hp);
  const hullHp   = n(ship.total_hp);
  const hasPower = ls.powerOutput > 0 || ls.powerDraw > 0;

  // ── Velocity ruler ─────────────────────────────────────
  const maxSpeed = Math.max(n(ship.max_speed), n(ship.boost_speed_forward), 500);
  const pctOf = (v: number | null | undefined) =>
    maxSpeed > 0 ? (Math.min(n(v), maxSpeed) / maxSpeed) * 100 : 0;

  // ── Hardpoints groupés ──────────────────────────────────
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
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-800/20 to-violet-950/30" />

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
              <span className="absolute -top-0 left-1 text-[9px] font-mono-sc text-cyan-400 whitespace-nowrap">
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

        {/* Légende sous la ruler */}
        <div className="flex gap-3 mb-3">
          {[
            { label: 'SCM',  color: 'bg-cyan-500',   value: fV(ship.scm_speed) + ' m/s' },
            { label: 'Boost',color: 'bg-amber-400',  value: fV(ship.boost_speed_forward) + ' m/s' },
            { label: 'Ret.', color: 'bg-amber-700',  value: fV(ship.boost_speed_backward ?? 0) + ' m/s' },
            { label: 'Nav',  color: 'bg-violet-500', value: fV(ship.max_speed) + ' m/s' },
          ].map(({ label, color, value }) => (
            <div key={label} className="flex items-center gap-1 min-w-0">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />
              <span className="text-[9px] font-mono-sc text-slate-600 shrink-0">{label}</span>
              <span className="text-[9px] font-mono-sc text-slate-400 tabular-nums truncate">{value}</span>
            </div>
          ))}
        </div>

        {/* Agilité — 3 mini barres verticales */}
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: 'Pitch', val: ship.pitch_max, max: 130, color: 'bg-emerald-600' },
            { label: 'Yaw',   val: ship.yaw_max,   max: 130, color: 'bg-emerald-600' },
            { label: 'Roll',  val: ship.roll_max,  max: 260, color: 'bg-teal-600' },
          ].map(({ label, val, max, color }) => (
            <div key={label} className="flex flex-col items-center gap-1 rounded-md border border-slate-800 bg-slate-900/40 py-2 px-1">
              <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest">{label}</span>
              {/* Barre verticale */}
              <div className="w-3 h-10 bg-slate-800 rounded-full overflow-hidden flex flex-col-reverse">
                <div
                  className={`w-full rounded-full ${color}`}
                  style={{ height: `${Math.min(100, (n(val) / max) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] font-mono-sc text-slate-300 tabular-nums">{fV(val)}°</span>
            </div>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════
          HARDPOINTS
      ════════════════════════════════════════ */}
      {hpGroups.size > 0 && (
        <div>
          <SectionLabel>Hardpoints — {ls.hardpoints.length} slots</SectionLabel>
          <div className="space-y-1.5">
            {Array.from(hpGroups.entries()).map(([type, sizes]) => {
              const st = TYPE_STYLE[type] ?? DEF_STYLE;
              return (
                <div key={type} className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono-sc w-14 shrink-0 ${st.row}`}>
                    {st.label}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {sizes.map((sz, i) => (
                      <span
                        key={i}
                        className={`
                          inline-flex items-center justify-center w-5 h-5
                          rounded text-[10px] font-orbitron font-bold leading-none
                          ${st.badge}
                        `}
                      >
                        {sz}
                      </span>
                    ))}
                  </div>
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
                    <span className="w-2 h-2 rounded-sm bg-cyan-500" />
                    <span className="text-[10px] font-mono-sc text-cyan-400 tabular-nums">{fK(shieldHp)} HP</span>
                  </span>
                )}
                {hullHp > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-slate-500" />
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

        {/* Armor resistance — 3 blocs côte à côte */}
        {armBars.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {armBars.map(({ k, v, color, text }) => {
              const pct = Math.round((1 - n(v)) * 100);
              return (
                <div
                  key={k}
                  className="relative flex flex-col items-center rounded-md border border-slate-800 bg-slate-900/40 overflow-hidden py-2.5 px-1"
                >
                  {/* fill de fond proportionnel */}
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

      </div>

      {/* ════════════════════════════════════════
          SYSTEMS — Power + Heat
      ════════════════════════════════════════ */}
      {hasPower && (
        <div>
          <SectionLabel>Systems</SectionLabel>
          <div className="space-y-2.5">
            {(() => {
              const pwrPct = ls.powerOutput > 0 ? (ls.powerDraw / ls.powerOutput) * 100 : 0;
              const htPct  = ls.cooling > 0 ? (ls.heat / ls.cooling) * 100 : 0;
              const pwrColor = pwrPct > 100 ? 'bg-red-600' : pwrPct > 80 ? 'bg-amber-500' : 'bg-yellow-500';
              const htColor  = htPct  > 100 ? 'bg-red-600' : htPct  > 80 ? 'bg-amber-500' : 'bg-blue-500';
              const pwrTxt   = pwrPct > 100 ? 'text-red-400' : pwrPct > 80 ? 'text-amber-400' : 'text-slate-300';
              const htTxt    = htPct  > 100 ? 'text-red-400' : htPct  > 80 ? 'text-amber-400' : 'text-slate-300';
              return (
                <>
                  <StatRow
                    label="Power"
                    value={`${fK(ls.powerDraw)} / ${fK(ls.powerOutput)}`}
                    pct={pwrPct} color={pwrColor} accent={pwrTxt}
                  />
                  {ls.cooling > 0 && (
                    <StatRow
                      label="Heat"
                      value={`${fK(ls.heat)} / ${fK(ls.cooling)}`}
                      pct={htPct} color={htColor} accent={htTxt}
                    />
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          FUEL + CARGO
      ════════════════════════════════════════ */}
      {(ship.hydrogen_fuel_capacity != null || ship.quantum_fuel_capacity != null) && (
        <div>
          <SectionLabel>Fuel</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {ship.hydrogen_fuel_capacity != null && (
              <div className="flex flex-col items-center rounded-md border border-slate-800 bg-slate-900/40 py-2 px-1">
                <span className="text-[9px] font-mono-sc text-slate-700 uppercase tracking-widest mb-0.5">Hydrogen</span>
                <span className="text-sm font-orbitron font-bold text-sky-400 tabular-nums">
                  {Number(ship.hydrogen_fuel_capacity).toFixed(1)}
                </span>
                <span className="text-[9px] font-mono-sc text-slate-700">SCU</span>
              </div>
            )}
            {ship.quantum_fuel_capacity != null && (
              <div className="flex flex-col items-center rounded-md border border-slate-800 bg-slate-900/40 py-2 px-1">
                <span className="text-[9px] font-mono-sc text-slate-700 uppercase tracking-widest mb-0.5">Quantum</span>
                <span className="text-sm font-orbitron font-bold text-violet-400 tabular-nums">
                  {Number(ship.quantum_fuel_capacity).toFixed(1)}
                </span>
                <span className="text-[9px] font-mono-sc text-slate-700">SCU</span>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
