/**
 * ShipStatsBanner — Bloc stats vaisseau 3 onglets (Combat / Speed / Survive)
 */

import { useState } from 'react';
import type { LoadoutNode, Ship } from '@/types/api';

// ── Helpers ──────────────────────────────────────────────
function n(v: unknown): number { return Number(v ?? 0) || 0; }
function fN(v: number | null | undefined, dec = 0): string {
  if (v == null) return '—';
  return Number(v).toFixed(dec);
}
function fK(val: number): string {
  if (val === 0) return '0';
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
  return val.toFixed(0);
}

// ── Flatten loadout tree ─────────────────────────────────
function flattenNodes(nodes: LoadoutNode[]): LoadoutNode[] {
  const r: LoadoutNode[] = [];
  for (const node of nodes) {
    r.push(node);
    if (node.children.length) r.push(...flattenNodes(node.children));
  }
  return r;
}

// ── Aggregated stats from loadout ────────────────────────
interface LoadoutStats {
  powerOutput: number;
  powerDraw: number;
  heat: number;
  cooling: number;
  shieldHp: number;
  totalDps: number;
  hardpoints: { type: string; size: number }[];
}

const HP_ORDER = ['WeaponGun', 'Weapon', 'Gimbal', 'Turret', 'MissileRack', 'Shield', 'PowerPlant', 'Cooler', 'QuantumDrive', 'Radar'];
const VISUAL_HP = new Set(HP_ORDER);
const NOISY = ['controller', '_door', 'radar_helper', 'fuel_tank', 'fuel_intake'];

function computeStats(nodes: LoadoutNode[]): LoadoutStats {
  const all = flattenNodes(nodes);
  let powerOutput = 0, powerDraw = 0, heat = 0, cooling = 0, shieldHp = 0, totalDps = 0;
  const hardpoints: { type: string; size: number }[] = [];

  for (const node of all) {
    if (!node.component_uuid) continue;
    powerOutput += n(node.power_output);
    powerDraw   += n(node.power_draw);
    heat        += n(node.heat_generation);
    cooling     += n(node.cooling_rate);
    shieldHp    += n(node.shield_hp);
    totalDps    += n(node.weapon_dps);

    const pn = node.port_name.toLowerCase();
    if (NOISY.some(p => pn.includes(p))) continue;
    const type = node.port_type || node.component_type || '';
    if (VISUAL_HP.has(type)) {
      hardpoints.push({ type, size: n(node.component_size ?? node.port_max_size) || 1 });
    }
  }

  hardpoints.sort((a, b) => {
    const di = HP_ORDER.indexOf(a.type) - HP_ORDER.indexOf(b.type);
    return di !== 0 ? di : b.size - a.size;
  });

  return { powerOutput, powerDraw, heat, cooling, shieldHp, totalDps, hardpoints };
}

// ── Hardpoint colors ─────────────────────────────────────
const HP_COLOR: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  WeaponGun:    { bg: 'bg-amber-950/70',  border: 'border-amber-600/50',  text: 'text-amber-400',  dot: 'bg-amber-500' },
  Weapon:       { bg: 'bg-amber-950/70',  border: 'border-amber-600/50',  text: 'text-amber-400',  dot: 'bg-amber-500' },
  Gimbal:       { bg: 'bg-amber-900/50',  border: 'border-amber-700/40',  text: 'text-amber-300',  dot: 'bg-amber-400' },
  Turret:       { bg: 'bg-amber-900/50',  border: 'border-amber-700/40',  text: 'text-amber-300',  dot: 'bg-amber-400' },
  MissileRack:  { bg: 'bg-orange-950/70', border: 'border-orange-600/50', text: 'text-orange-400', dot: 'bg-orange-500' },
  Shield:       { bg: 'bg-cyan-950/70',   border: 'border-cyan-600/50',   text: 'text-cyan-400',   dot: 'bg-cyan-500' },
  PowerPlant:   { bg: 'bg-yellow-950/70', border: 'border-yellow-600/50', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  Cooler:       { bg: 'bg-blue-950/70',   border: 'border-blue-700/50',   text: 'text-blue-400',   dot: 'bg-blue-500' },
  QuantumDrive: { bg: 'bg-violet-950/70', border: 'border-violet-600/50', text: 'text-violet-400', dot: 'bg-violet-500' },
  Radar:        { bg: 'bg-indigo-950/70', border: 'border-indigo-600/50', text: 'text-indigo-400', dot: 'bg-indigo-500' },
};
const DEF_HP_COLOR = { bg: 'bg-slate-800', border: 'border-slate-700', text: 'text-slate-500', dot: 'bg-slate-600' };

// ── Primitives UI ────────────────────────────────────────

/** Barre de stat avec label + valeur + fill */
function StatBar({
  label, value, max, unit = '',
  color = 'bg-cyan-600', subValue,
}: {
  label: string; value: number; max: number; unit?: string;
  color?: string; subValue?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="group">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] font-mono-sc text-slate-500 uppercase tracking-widest">{label}</span>
        <div className="flex items-baseline gap-1.5">
          {subValue && <span className="text-[10px] font-mono-sc text-slate-600">{subValue}</span>}
          <span className="text-xs font-mono-sc text-slate-200 tabular-nums">
            {value > 0 ? `${fN(value)}${unit}` : '—'}
          </span>
        </div>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Barre de résistance — value 0-1, affiché en % de réduction */
function ArmorBar({
  label, value, color,
}: { label: string; value: number | null | undefined; color: string }) {
  if (value == null) return null;
  const pct = Math.round((1 - n(value)) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] font-mono-sc text-slate-500 uppercase tracking-widest">{label}</span>
        <span className={`text-xs font-mono-sc font-semibold ${pct > 0 ? color : 'text-slate-600'}`}>
          {pct > 0 ? `${pct}%` : '0%'}
        </span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color.replace('text-', 'bg-')}`}
          style={{ width: `${Math.max(pct > 0 ? 3 : 0, pct)}%` }}
        />
      </div>
    </div>
  );
}

/** Barre énergie — used/total avec couleur selon saturation */
function EnergyBar({
  label, used, total, colorOk, colorWarn, colorOver,
}: {
  label: string; used: number; total: number;
  colorOk: string; colorWarn: string; colorOver: string;
}) {
  if (total === 0 && used === 0) return null;
  const pct = total > 0 ? (used / total) * 100 : 0;
  const barColor = pct > 100 ? colorOver : pct > 80 ? colorWarn : colorOk;
  const textColor = pct > 100 ? 'text-red-400' : pct > 80 ? 'text-amber-400' : 'text-slate-300';
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] font-mono-sc text-slate-500 uppercase tracking-widest">{label}</span>
        <span className={`text-xs font-mono-sc tabular-nums ${textColor}`}>
          {total > 0
            ? `${fK(used)} / ${fK(total)}  (${Math.round(pct)}%)`
            : fK(used)}
        </span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

/** Grande valeur + unité + label sous */
function BigStat({
  value, unit, label, color = 'text-slate-100',
}: { value: string; unit?: string; label: string; color?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 py-3 px-2 min-w-0">
      <div className="flex items-baseline gap-0.5">
        <span className={`font-orbitron font-bold text-lg leading-none tabular-nums ${color}`}>{value}</span>
        {unit && <span className="text-[9px] font-mono-sc text-slate-600 self-end mb-0.5">{unit}</span>}
      </div>
      <span className="text-[9px] font-mono-sc text-slate-600 mt-1 uppercase tracking-widest text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

// ── Tab definitions ──────────────────────────────────────
type Tab = 'combat' | 'speed' | 'survive';
const TABS: { id: Tab; label: string }[] = [
  { id: 'combat',  label: 'Combat'  },
  { id: 'speed',   label: 'Speed'   },
  { id: 'survive', label: 'Survive' },
];

// ── Composant principal ──────────────────────────────────
interface Props { ship: Ship; loadout: LoadoutNode[] }

export function ShipStatsBanner({ ship, loadout }: Props) {
  const [tab, setTab] = useState<Tab>('combat');
  const ls = computeStats(loadout);

  const shieldHp   = ls.shieldHp > 0 ? ls.shieldHp : n(ship.shield_hp);
  const hasPower   = ls.powerOutput > 0 || ls.powerDraw > 0;

  return (
    <div className="space-y-3">
      {/* ── Navigation tabs ─────────────────────── */}
      <div className="flex gap-1 border-b border-slate-800 pb-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`
              text-[10px] font-mono-sc uppercase tracking-widest px-3 py-1.5 rounded-t border-b-2 transition-all
              ${tab === t.id
                ? 'border-cyan-500 text-cyan-400 bg-cyan-950/20'
                : 'border-transparent text-slate-600 hover:text-slate-400'
              }
            `}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════
          ONGLET : COMBAT
      ═══════════════════════════════════════════ */}
      {tab === 'combat' && (
        <div className="space-y-4">
          {/* Trio big stats */}
          <div className="grid grid-cols-3 gap-2">
            <BigStat
              value={ls.totalDps > 0 ? fK(ls.totalDps) : '—'}
              unit="DPS"
              label="Weapons"
              color="text-amber-400"
            />
            <BigStat
              value={shieldHp > 0 ? fK(shieldHp) : '—'}
              unit="HP"
              label="Shields"
              color="text-cyan-400"
            />
            <BigStat
              value={ship.total_hp != null ? fK(n(ship.total_hp)) : '—'}
              unit="HP"
              label="Hull"
              color="text-slate-300"
            />
          </div>

          {/* Grille de hardpoints */}
          {ls.hardpoints.length > 0 && (
            <div>
              <p className="text-[10px] font-mono-sc text-slate-700 uppercase tracking-widest mb-2">
                Hardpoints — {ls.hardpoints.length}
              </p>
              <div className="flex flex-wrap gap-1">
                {ls.hardpoints.map((hp, i) => {
                  const c = HP_COLOR[hp.type] ?? DEF_HP_COLOR;
                  return (
                    <div
                      key={i}
                      title={hp.type}
                      className={`
                        inline-flex items-center justify-center
                        w-8 h-8 rounded border font-orbitron font-bold text-[11px]
                        ${c.bg} ${c.border} ${c.text}
                      `}
                    >
                      {hp.size}
                    </div>
                  );
                })}
              </div>
              {/* Légende */}
              {(() => {
                const seen = new Map<string, { dot: string; label: string }>();
                for (const hp of ls.hardpoints) {
                  if (!seen.has(hp.type)) {
                    const c = HP_COLOR[hp.type] ?? DEF_HP_COLOR;
                    const label = hp.type.replace(/([A-Z])/g, ' $1').trim();
                    seen.set(hp.type, { dot: c.dot, label });
                  }
                }
                return (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    {Array.from(seen.entries()).map(([type, { dot, label }]) => (
                      <span key={type} className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                        <span className="text-[9px] font-mono-sc text-slate-600">{label}</span>
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Conso énergie */}
          {hasPower && (
            <EnergyBar
              label="Power draw"
              used={ls.powerDraw} total={ls.powerOutput}
              colorOk="bg-yellow-600" colorWarn="bg-amber-500" colorOver="bg-red-600"
            />
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════
          ONGLET : SPEED
      ═══════════════════════════════════════════ */}
      {tab === 'speed' && (
        <div className="space-y-4">
          {/* Vitesses */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-mono-sc text-slate-700 uppercase tracking-widest">Velocities</p>
            <StatBar
              label="SCM Speed"
              value={n(ship.scm_speed)} max={800} unit=" m/s"
              color="bg-cyan-600"
            />
            <StatBar
              label="Boost Fwd"
              value={n(ship.boost_speed_forward)} max={2500} unit=" m/s"
              color="bg-amber-500"
              subValue={
                ship.boost_speed_forward != null && ship.scm_speed != null
                  ? `×${(n(ship.boost_speed_forward) / n(ship.scm_speed)).toFixed(1)}`
                  : undefined
              }
            />
            <StatBar
              label="Boost Back"
              value={n(ship.boost_speed_backward ?? 0)} max={2500} unit=" m/s"
              color="bg-amber-700"
            />
            <StatBar
              label="Nav Max"
              value={n(ship.max_speed)} max={2000} unit=" m/s"
              color="bg-violet-500"
            />
          </div>

          {/* Agilité */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-mono-sc text-slate-700 uppercase tracking-widest">Agility</p>
            <StatBar label="Pitch" value={n(ship.pitch_max)} max={130} unit="°/s" color="bg-emerald-600" />
            <StatBar label="Yaw"   value={n(ship.yaw_max)}   max={130} unit="°/s" color="bg-emerald-600" />
            <StatBar label="Roll"  value={n(ship.roll_max)}  max={260} unit="°/s" color="bg-teal-600" />
          </div>

          {/* Carburant */}
          <div className="grid grid-cols-2 gap-2">
            <BigStat value={fN(ship.hydrogen_fuel_capacity, 1)} unit="SCU" label="H₂ Tank" color="text-sky-400" />
            <BigStat value={fN(ship.quantum_fuel_capacity, 1)}  unit="SCU" label="QT Tank"  color="text-violet-400" />
          </div>
          {(ship.cargo_capacity ?? 0) > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
              <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Cargo</span>
              <span className="text-sm font-mono-sc text-slate-200">
                {ship.cargo_capacity} SCU
              </span>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════
          ONGLET : SURVIVE
      ═══════════════════════════════════════════ */}
      {tab === 'survive' && (
        <div className="space-y-4">
          {/* HP */}
          <div className="grid grid-cols-2 gap-2">
            <BigStat
              value={shieldHp > 0 ? fK(shieldHp) : '—'}
              unit="HP"
              label="Shields"
              color="text-cyan-400"
            />
            <BigStat
              value={ship.total_hp != null ? fK(n(ship.total_hp)) : '—'}
              unit="HP"
              label="Hull"
              color="text-slate-300"
            />
          </div>

          {/* Résistances armure */}
          {(ship.armor_physical != null || ship.armor_energy != null || ship.armor_distortion != null) && (
            <div className="space-y-2.5">
              <p className="text-[10px] font-mono-sc text-slate-700 uppercase tracking-widest">
                Armor Reduction
              </p>
              <ArmorBar label="Physical"   value={ship.armor_physical}   color="text-slate-300" />
              <ArmorBar label="Energy"     value={ship.armor_energy}     color="text-cyan-400" />
              <ArmorBar label="Distortion" value={ship.armor_distortion} color="text-violet-400" />
            </div>
          )}

          {/* Systèmes énergie */}
          {hasPower && (
            <div className="space-y-2.5">
              <p className="text-[10px] font-mono-sc text-slate-700 uppercase tracking-widest">Systems</p>
              <EnergyBar
                label="Power consumption"
                used={ls.powerDraw} total={ls.powerOutput}
                colorOk="bg-yellow-600" colorWarn="bg-amber-500" colorOver="bg-red-600"
              />
              {ls.cooling > 0 && (
                <EnergyBar
                  label="Heat / Cooling"
                  used={ls.heat} total={ls.cooling}
                  colorOk="bg-blue-600" colorWarn="bg-amber-500" colorOver="bg-red-600"
                />
              )}
            </div>
          )}

          {/* Assurance */}
          {ship.insurance_claim_time != null && (
            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
              <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Claim time</span>
              <span className="text-xs font-mono-sc text-slate-300">
                {Number(ship.insurance_claim_time).toFixed(1)} min
              </span>
            </div>
          )}
          {ship.insurance_expedite_cost != null && (
            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
              <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Expedite</span>
              <span className="text-xs font-mono-sc text-amber-400">
                {Number(ship.insurance_expedite_cost).toLocaleString('en-US')} aUEC
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
