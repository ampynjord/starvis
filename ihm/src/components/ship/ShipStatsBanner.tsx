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
                    <span className="text-[10px] font-mono-sc text-cyan-600">Shield</span>
                    <span className="text-[10px] font-mono-sc text-cyan-400 tabular-nums">{fK(shieldHp)} HP</span>
                  </span>
                )}
                {hullHp > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-slate-500" />
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
          SIGNATURES
      ════════════════════════════════════════ */}
      {(ship.armor_signal_ir != null || ship.armor_signal_em != null || ship.armor_signal_cs != null) && (() => {
        const sigs = [
          { key: 'IR',    label: 'Thermal',  val: ship.armor_signal_ir, color: '#f97316', dimColor: 'text-orange-400', trackColor: 'rgba(234,88,12,0.15)' },
          { key: 'EM',    label: 'Electro',  val: ship.armor_signal_em, color: '#a855f7', dimColor: 'text-violet-400', trackColor: 'rgba(168,85,247,0.15)' },
          { key: 'CS',    label: 'Cross-sec',val: ship.armor_signal_cs, color: '#06b6d4', dimColor: 'text-cyan-400',   trackColor: 'rgba(6,182,212,0.15)'  },
        ].filter(s => s.val != null) as { key: string; label: string; val: number; color: string; dimColor: string; trackColor: string }[];

        // Référence : 1.0 = baseline. Valeurs normalement entre 0 et 1+
        // (on ignore maxVal car les valeurs sont déjà en fraction de la référence)

        return (
          <div>
            <SectionLabel>Signatures</SectionLabel>
            <div className="grid grid-cols-3 gap-1.5">
              {sigs.map(({ key, label, val, color, dimColor, trackColor }) => {
                const pct = Math.min(val * 100, 100);
                // Couleur selon pct relatif : bas = emerald, moyen = amber, haut = red
                const barColor = pct < 40 ? '#22c55e' : pct < 70 ? '#f59e0b' : '#ef4444';
                const r = 18, cx = 24, cy = 24;
                const startA = -210 * (Math.PI / 180);
                const endA   =  30  * (Math.PI / 180);
                const totalA = endA - startA;
                const fillA  = startA + (pct / 100) * totalA;
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
                      {/* Label clé */}
                      <text x={cx} y={cy + 6} textAnchor="middle" fontSize="7"
                        fontWeight="bold" fontFamily="monospace" fill={color} opacity="0.85">
                        {key}
                      </text>
                    </svg>
                    <span className="text-[9px] font-mono-sc text-slate-600 uppercase tracking-widest -mt-0.5">{label}</span>
                    <span className={`text-[11px] font-orbitron font-bold tabular-nums mt-0.5 ${dimColor}`}>
                      {(val * 100).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ════════════════════════════════════════
          SYSTEMS — Power + Heat
      ════════════════════════════════════════ */}
      {hasPower && (
        <div>
          <SectionLabel>Systems</SectionLabel>
          {(() => {
            const pwrPct = ls.powerOutput > 0 ? (ls.powerDraw / ls.powerOutput) * 100 : 0;
            const htPct  = ls.cooling > 0 ? (ls.heat / ls.cooling) * 100 : 0;

            // Couleurs selon utilisation
            const pwrStroke = pwrPct > 100 ? '#ef4444' : pwrPct > 80 ? '#f59e0b' : '#eab308';
            const htStroke  = htPct  > 100 ? '#ef4444' : htPct  > 80 ? '#f59e0b' : '#3b82f6';
            const pwrTxt    = pwrPct > 100 ? 'text-red-400' : pwrPct > 80 ? 'text-amber-400' : 'text-yellow-400';
            const htTxt     = htPct  > 100 ? 'text-red-400' : htPct  > 80 ? 'text-amber-400' : 'text-blue-400';

            /** Arc SVG semi-circulaire (haut = 0%, bas gauche = 50%, bas droite = 100%) */
            function ArcGauge({
              pct, stroke, label, draw, capacity, textClass,
            }: {
              pct: number; stroke: string; label: string;
              draw: string; capacity: string; textClass: string;
            }) {
              const r = 28;
              const cx = 36, cy = 36;
              // Arc de -210° à +30° (240° total, ouverture en bas)
              const startAngle = -210 * (Math.PI / 180);
              const endAngle   =   30 * (Math.PI / 180);
              const totalAngle = endAngle - startAngle; // 240° en radians

              const clampedPct = Math.min(pct, 100);
              const fillAngle  = startAngle + (clampedPct / 100) * totalAngle;

              // arc path helper
              const arcPath = (from: number, to: number) => {
                const x1 = cx + r * Math.cos(from), y1 = cy + r * Math.sin(from);
                const x2 = cx + r * Math.cos(to),   y2 = cy + r * Math.sin(to);
                const large = (to - from) > Math.PI ? 1 : 0;
                return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
              };

              return (
                <div className="flex flex-col items-center">
                  <div className="relative w-[72px] h-[50px] overflow-visible">
                    <svg viewBox="0 0 72 60" className="w-full" style={{ overflow: 'visible' }}>
                      {/* Piste fond */}
                      <path d={arcPath(startAngle, endAngle)}
                        fill="none" stroke="rgba(51,65,85,0.8)" strokeWidth="5"
                        strokeLinecap="round" />
                      {/* Remplissage */}
                      {clampedPct > 0 && (
                        <path d={arcPath(startAngle, fillAngle)}
                          fill="none" stroke={stroke} strokeWidth="5"
                          strokeLinecap="round" opacity="0.85" />
                      )}
                      {/* Dépassement rouge si > 100% */}
                      {pct > 100 && (
                        <path d={arcPath(startAngle, endAngle)}
                          fill="none" stroke="#ef4444" strokeWidth="5"
                          strokeLinecap="round" opacity="0.4"
                          strokeDasharray="3 2" />
                      )}
                      {/* Valeur % au centre */}
                      <text x={cx} y={cy - 2}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize="11" fontWeight="bold" fontFamily="monospace"
                        fill={stroke}>
                        {Math.round(pct)}%
                      </text>
                    </svg>
                  </div>
                  {/* Label + draw/capacity sous la jauge */}
                  <span className="text-[9px] font-mono-sc text-slate-500 uppercase tracking-widest -mt-1">{label}</span>
                  <span className={`text-[9px] font-mono-sc tabular-nums mt-0.5 ${textClass}`}>
                    {draw} <span className="text-slate-700">/</span> {capacity}
                  </span>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-2 gap-2">
                <ArcGauge
                  pct={pwrPct} stroke={pwrStroke} label="Power"
                  draw={fK(ls.powerDraw)} capacity={fK(ls.powerOutput)}
                  textClass={pwrTxt}
                />
                {ls.cooling > 0 && (
                  <ArcGauge
                    pct={htPct} stroke={htStroke} label="Heat"
                    draw={fK(ls.heat)} capacity={fK(ls.cooling)}
                    textClass={htTxt}
                  />
                )}
              </div>
            );
          })()}
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
                <span className="text-[9px] font-mono-sc text-slate-700">L</span>
              </div>
            )}
            {ship.quantum_fuel_capacity != null && (
              <div className="flex flex-col items-center rounded-md border border-slate-800 bg-slate-900/40 py-2 px-1">
                <span className="text-[9px] font-mono-sc text-slate-700 uppercase tracking-widest mb-0.5">Quantum</span>
                <span className="text-sm font-orbitron font-bold text-violet-400 tabular-nums">
                  {Number(ship.quantum_fuel_capacity).toFixed(1)}
                </span>
                <span className="text-[9px] font-mono-sc text-slate-700">L</span>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
