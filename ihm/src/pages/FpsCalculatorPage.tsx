import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Crosshair, Shield, SlidersHorizontal, Target } from 'lucide-react';
import { useEnv } from '@/contexts/EnvContext';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { api } from '@/services/api';
import type { Item, ItemListItem } from '@/types/api';

const FIRE_RATE_PROFILES = [
  { value: 0, label: 'No boost' },
  { value: 5, label: 'Light boost (+5%)' },
  { value: 10, label: 'Medium boost (+10%)' },
  { value: 15, label: 'High boost (+15%)' },
] as const;

const DAMAGE_PROFILES = [
  { value: 0, label: 'No boost' },
  { value: 5, label: 'Light boost (+5%)' },
  { value: 10, label: 'Medium boost (+10%)' },
  { value: 15, label: 'High boost (+15%)' },
] as const;

type FireMode = 'Single' | 'Burst' | 'Auto';
type TargetMode = 'normal' | 'advanced';
type Hitbox = 'head' | 'torso' | 'arm' | 'leg';

type WeaponSummary = {
  uuid: string;
  name: string;
  type: string;
  sub_type: string | null;
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round(v: number, d = 2): number {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

function inferFireMode(item: Item): FireMode {
  const probe = `${item.name || ''} ${item.sub_type || ''} ${item.class_name || ''}`.toLowerCase();
  if (/burst/.test(probe)) return 'Burst';
  if (/sniper|shotgun|railgun|single/.test(probe)) return 'Single';
  return 'Auto';
}

function getHitboxMultiplier(hitbox: Hitbox): number {
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

export default function FpsCalculatorPage() {
  const { env } = useEnv();

  const [selectedWeaponUuid, setSelectedWeaponUuid] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [fireMode, setFireMode] = useState<FireMode>('Auto');
  const [targetMode, setTargetMode] = useState<TargetMode>('normal');
  const [craftedMitigationBonus, setCraftedMitigationBonus] = useState<number>(0);
  const [armorClass, setArmorClass] = useState<'none' | 'light' | 'medium' | 'heavy'>('medium');
  const [hitbox, setHitbox] = useState<Hitbox>('torso');
  const [health, setHealth] = useState<number>(100);
  const [barrelRateBonus, setBarrelRateBonus] = useState<number>(0);
  const [underbarrelDamageBonus, setUnderbarrelDamageBonus] = useState<number>(0);

  const { data: itemFilters } = useQuery({
    queryKey: ['items.filters', env],
    queryFn: () => api.items.filters(env),
    staleTime: Infinity,
  });

  const weaponTypes = useMemo(() => {
    const allTypes = (itemFilters?.types ?? []).filter(Boolean);
    return allTypes.filter((t) => /(weapon|gun|rifle|pistol|shotgun|smg|sniper|launcher)/i.test(t));
  }, [itemFilters]);

  const { data: weaponListData, isLoading: loadingWeapons, error: weaponsError, refetch: refetchWeapons } = useQuery({
    queryKey: ['fps.weapon-list', env, weaponTypes.join(',')],
    queryFn: () => api.items.list({ env, page: 1, limit: 200, types: weaponTypes.join(',') || undefined }),
    enabled: weaponTypes.length > 0,
  });

  const weapons = useMemo<WeaponSummary[]>(() => {
    const rows = (weaponListData?.data ?? []) as ItemListItem[];
    return rows.map((w) => ({
      uuid: w.uuid,
      name: w.name,
      type: w.type,
      sub_type: w.sub_type,
    }));
  }, [weaponListData]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const w of weapons) s.add(w.sub_type || w.type || 'Unclassified');
    return ['all', ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [weapons]);

  const filteredWeapons = useMemo(() => {
    if (selectedCategory === 'all') return weapons;
    return weapons.filter((w) => (w.sub_type || w.type || 'Unclassified') === selectedCategory);
  }, [weapons, selectedCategory]);

  const selectedWeapon = useMemo(() => {
    if (!selectedWeaponUuid) return filteredWeapons[0] ?? null;
    return filteredWeapons.find((w) => w.uuid === selectedWeaponUuid) ?? filteredWeapons[0] ?? null;
  }, [filteredWeapons, selectedWeaponUuid]);

  const { data: weaponDetail, isLoading: loadingWeaponDetail } = useQuery({
    queryKey: ['fps.weapon-detail', env, selectedWeapon?.uuid],
    queryFn: () => api.items.get(selectedWeapon!.uuid, env),
    enabled: !!selectedWeapon?.uuid,
  });

  const computed = useMemo(() => {
    if (!weaponDetail) return null;

    const dj = weaponDetail.data_json as Record<string, unknown> | null | undefined;

    // Prioritize direct fields, fallback to data_json for damage (extracted via launchParams path)
    const baseDamageFromField =
      Number(weaponDetail.weapon_damage ?? 0) ||
      Number(
        (dj?.damagePhysical as number ?? 0) +
        (dj?.damageEnergy as number ?? 0) +
        (dj?.damageDistortion as number ?? 0)
      );
    const baseDpsFromField = Number(weaponDetail.weapon_dps ?? 0);
    const baseFireRateFromField = Number(weaponDetail.weapon_fire_rate ?? 0);

    const resolvedFireMode = inferFireMode(weaponDetail);
    const appliedMode = fireMode || resolvedFireMode;
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

    const fireRateMultiplier = 1 + barrelRateBonus / 100;
    const damageMultiplier = 1 + underbarrelDamageBonus / 100;
    const hitboxMultiplier = getHitboxMultiplier(hitbox);
    const baseReduction = getArmorReduction(armorClass);
    const mitigation = clamp(baseReduction + craftedMitigationBonus / 100, 0, 0.9);

    const effectiveRpm = baseRpm * fireRateMultiplier * modeRateMultiplier;
    const damagePerShotRaw = baseDamage * damageMultiplier * modeDamageMultiplier * hitboxMultiplier;
    const damagePerShot = damagePerShotRaw * (1 - mitigation);
    const sustainedDps = effectiveRpm > 0 ? (damagePerShot * effectiveRpm) / 60 : 0;
    const burstDps = sustainedDps * (appliedMode === 'Burst' ? 1.12 : 1.04);

    const safeHealth = Math.max(1, health);
    const shotsToKill = damagePerShot > 0 ? Math.ceil(safeHealth / damagePerShot) : Infinity;
    const ttk =
      Number.isFinite(shotsToKill) && shotsToKill > 1 && effectiveRpm > 0
        ? (shotsToKill - 1) / (effectiveRpm / 60)
        : 0;

    const timeline = buildShotTimeline(ttk, effectiveRpm, Number.isFinite(shotsToKill) ? shotsToKill : 0);

    return {
      baseDamage: round(baseDamage, 2),
      baseRpm: round(baseRpm, 1),
      effectiveRpm: round(effectiveRpm, 1),
      reductionPct: round(mitigation * 100, 1),
      damagePerShot: round(damagePerShot, 2),
      sustainedDps: round(sustainedDps, 2),
      burstDps: round(burstDps, 2),
      shotsToKill: Number.isFinite(shotsToKill) ? shotsToKill : 0,
      ttk: round(ttk, 3),
      timeline,
      activeModifiers: [
        barrelRateBonus > 0 ? `Fire rate +${barrelRateBonus}%` : null,
        underbarrelDamageBonus > 0 ? `Damage +${underbarrelDamageBonus}%` : null,
        craftedMitigationBonus > 0 ? `Target mitigation +${craftedMitigationBonus}%` : null,
        hitbox !== 'torso' ? `Hitbox: ${hitbox}` : null,
        appliedMode !== resolvedFireMode ? `Fire mode override: ${appliedMode}` : null,
      ].filter(Boolean) as string[],
    };
  }, [weaponDetail, fireMode, barrelRateBonus, underbarrelDamageBonus, hitbox, armorClass, craftedMitigationBonus, health]);

  const axisMax = useMemo(() => {
    if (!computed) return 3;
    if (computed.ttk <= 3) return 3;
    return Math.ceil(computed.ttk);
  }, [computed]);

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">
          FPS Calculator
        </h1>
        <p className="text-sm text-slate-500 mt-1 font-mono-sc">
          Weapon damage and TTK analysis with attachments, mitigation and hitbox simulation.
        </p>
      </div>

      {loadingWeapons ? (
        <LoadingGrid message="Loading FPS weapons..." />
      ) : weaponsError ? (
        <ErrorState error={weaponsError as Error} onRetry={() => void refetchWeapons()} />
      ) : weapons.length === 0 ? (
        <EmptyState icon="+" title="No FPS weapon data" message="No weapon-compatible items were found in current environment." />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
          <div className="xl:col-span-1 space-y-4">
            <ScifiPanel title="Weapon Selection" subtitle="Category, weapon, fire mode">
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 font-mono-sc uppercase tracking-wider">
                    Category
                  </label>
                  <select
                    className="sci-select w-full text-xs"
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value);
                      setSelectedWeaponUuid('');
                    }}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c === 'all' ? 'All categories' : c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 font-mono-sc uppercase tracking-wider">
                    Weapon
                  </label>
                  <select
                    className="sci-select w-full text-xs"
                    value={selectedWeapon?.uuid ?? ''}
                    onChange={(e) => setSelectedWeaponUuid(e.target.value)}
                  >
                    {filteredWeapons.map((w) => (
                      <option key={w.uuid} value={w.uuid}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 font-mono-sc uppercase tracking-wider">
                    Fire mode
                  </label>
                  <select
                    className="sci-select w-full text-xs"
                    value={fireMode}
                    onChange={(e) => setFireMode(e.target.value as FireMode)}
                  >
                    <option value="Single">Single</option>
                    <option value="Burst">Burst</option>
                    <option value="Auto">Auto</option>
                  </select>
                </div>
              </div>
            </ScifiPanel>

            <ScifiPanel title="Attachments & Crafting" subtitle="Rate and damage enhancements">
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 font-mono-sc uppercase tracking-wider">
                    Barrel (rate)
                  </label>
                  <select
                    className="sci-select w-full text-xs"
                    value={barrelRateBonus}
                    onChange={(e) => setBarrelRateBonus(Number(e.target.value))}
                  >
                    {FIRE_RATE_PROFILES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 font-mono-sc uppercase tracking-wider">
                    Underbarrel (damage)
                  </label>
                  <select
                    className="sci-select w-full text-xs"
                    value={underbarrelDamageBonus}
                    onChange={(e) => setUnderbarrelDamageBonus(Number(e.target.value))}
                  >
                    {DAMAGE_PROFILES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </ScifiPanel>

            <ScifiPanel title="Target" subtitle="Mitigation and hitbox profile">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`sci-btn flex-1 ${targetMode === 'normal' ? 'sci-btn-primary' : 'sci-btn-ghost'}`}
                    onClick={() => setTargetMode('normal')}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    className={`sci-btn flex-1 ${targetMode === 'advanced' ? 'sci-btn-primary' : 'sci-btn-ghost'}`}
                    onClick={() => setTargetMode('advanced')}
                  >
                    Advanced
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 font-mono-sc uppercase tracking-wider">
                    Armor class
                  </label>
                  <select
                    className="sci-select w-full text-xs"
                    value={armorClass}
                    onChange={(e) => setArmorClass(e.target.value as 'none' | 'light' | 'medium' | 'heavy')}
                  >
                    <option value="none">None</option>
                    <option value="light">Light</option>
                    <option value="medium">Medium</option>
                    <option value="heavy">Heavy</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 font-mono-sc uppercase tracking-wider">
                    Hitbox
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['head', 'torso', 'arm', 'leg'] as Hitbox[]).map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setHitbox(h)}
                        className={`sci-btn text-[11px] py-1 justify-center ${hitbox === h ? 'sci-btn-primary' : 'sci-btn-ghost'}`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 font-mono-sc uppercase tracking-wider">
                    Target health: {health} HP
                  </label>
                  <input
                    type="range"
                    min={50}
                    max={300}
                    step={5}
                    value={health}
                    onChange={(e) => setHealth(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                {targetMode === 'advanced' && (
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1 font-mono-sc uppercase tracking-wider">
                      Crafted mitigation bonus: {craftedMitigationBonus}%
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={30}
                      step={1}
                      value={craftedMitigationBonus}
                      onChange={(e) => setCraftedMitigationBonus(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                )}
              </div>
            </ScifiPanel>
          </div>

          <div className="xl:col-span-2 space-y-4">
            <ScifiPanel title="Damage Analysis" subtitle="Per shot, DPS, shots-to-kill and TTK">
              {loadingWeaponDetail || !computed ? (
                <LoadingGrid message="Computing weapon metrics..." />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="sci-panel p-3">
                      <div className="text-[10px] text-slate-600 font-mono-sc uppercase">Damage / shot</div>
                      <div className="font-orbitron text-lg text-cyan-300">{computed.damagePerShot}</div>
                      <div className="text-[10px] text-slate-600 mt-1">Base: {computed.baseDamage}</div>
                    </div>
                    <div className="sci-panel p-3">
                      <div className="text-[10px] text-slate-600 font-mono-sc uppercase">DPS (sustained)</div>
                      <div className="font-orbitron text-lg text-green-300">{computed.sustainedDps}</div>
                      <div className="text-[10px] text-slate-600 mt-1">Burst: {computed.burstDps}</div>
                    </div>
                    <div className="sci-panel p-3">
                      <div className="text-[10px] text-slate-600 font-mono-sc uppercase">Shots to kill</div>
                      <div className="font-orbitron text-lg text-amber-300">{computed.shotsToKill}</div>
                      <div className="text-[10px] text-slate-600 mt-1">Health: {health} HP</div>
                    </div>
                    <div className="sci-panel p-3">
                      <div className="text-[10px] text-slate-600 font-mono-sc uppercase">Time to kill</div>
                      <div className="font-orbitron text-lg text-red-300">{computed.ttk}s</div>
                      <div className="text-[10px] text-slate-600 mt-1">@ {computed.effectiveRpm} RPM</div>
                    </div>
                  </div>

                  <div className="sci-panel p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono-sc text-slate-500 uppercase tracking-wider">
                        TTK visualization
                      </span>
                      <span className="text-xs text-slate-600">0s - {axisMax}s</span>
                    </div>

                    <div className="relative h-14 border border-border rounded bg-panel overflow-hidden">
                      <div className="absolute inset-0 flex">
                        {Array.from({ length: axisMax + 1 }).map((_, i) => (
                          <div key={i} className="flex-1 border-r border-border/40 relative">
                            <span className="absolute top-1 left-1 text-[9px] text-slate-600">{i}s</span>
                          </div>
                        ))}
                      </div>

                      {computed.timeline.map((t, idx) => {
                        const leftPct = clamp((t / axisMax) * 100, 0, 100);
                        return (
                          <motion.div
                            key={`${t}-${idx}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(idx * 0.02, 0.35) }}
                            className="absolute bottom-1 w-1.5 h-8 bg-cyan-400/70 border border-cyan-300/80 rounded-sm"
                            style={{ left: `calc(${leftPct}% - 3px)` }}
                            title={`Shot ${idx + 1}: ${t}s`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <ScifiPanel title="Weapon State" className="p-3" actions={<Crosshair size={14} className="text-cyan-500" />}>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between"><span className="text-slate-600">Selected</span><span>{weaponDetail?.name || '-'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-600">Type</span><span>{weaponDetail?.type || '-'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-600">Subtype</span><span>{weaponDetail?.sub_type || '-'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-600">Base RPM</span><span>{computed.baseRpm}</span></div>
                        <div className="flex justify-between"><span className="text-slate-600">Base damage</span><span className={computed.baseDamage > 0 ? 'text-cyan-300' : 'text-red-400'}>{computed.baseDamage > 0 ? computed.baseDamage : 'N/A'}</span></div>
                        {weaponDetail?.weapon_damage_type && (
                          <div className="flex justify-between"><span className="text-slate-600">Dmg type</span><span className="capitalize">{weaponDetail.weapon_damage_type}</span></div>
                        )}
                        {(() => {
                          const dj = weaponDetail?.data_json as Record<string, unknown> | null | undefined;
                          const p = Number(dj?.damagePhysical ?? 0);
                          const e = Number(dj?.damageEnergy ?? 0);
                          const d = Number(dj?.damageDistortion ?? 0);
                          if (p + e + d <= 0) return null;
                          return <>
                            {p > 0 && <div className="flex justify-between"><span className="text-slate-600">Physical</span><span className="text-orange-300">{p}</span></div>}
                            {e > 0 && <div className="flex justify-between"><span className="text-slate-600">Energy</span><span className="text-yellow-300">{e}</span></div>}
                            {d > 0 && <div className="flex justify-between"><span className="text-slate-600">Distortion</span><span className="text-purple-300">{d}</span></div>}
                          </>;
                        })()}
                        <div className="flex justify-between"><span className="text-slate-600">Mitigation</span><span>{computed.reductionPct}%</span></div>
                      </div>
                    </ScifiPanel>

                    <ScifiPanel title="Active Modifiers" className="p-3" actions={<SlidersHorizontal size={14} className="text-cyan-500" />}>
                      {computed.activeModifiers.length === 0 ? (
                        <p className="text-xs text-slate-600">No active modifiers.</p>
                      ) : (
                        <ul className="space-y-1">
                          {computed.activeModifiers.map((m) => (
                            <li key={m} className="text-xs text-slate-300 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                              {m}
                            </li>
                          ))}
                        </ul>
                      )}
                    </ScifiPanel>
                  </div>
                </div>
              )}
            </ScifiPanel>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <ScifiPanel title="Target" subtitle="Mitigation model" className="p-3" actions={<Target size={14} className="text-cyan-500" />}>
                <p className="text-xs text-slate-500">
                  Damage applies hitbox multiplier then armor reduction and crafted mitigation bonus.
                </p>
              </ScifiPanel>
              <ScifiPanel title="Armor" subtitle="Reduction baseline" className="p-3" actions={<Shield size={14} className="text-cyan-500" />}>
                <p className="text-xs text-slate-500">
                  None 0%, Light 25%, Medium 40%, Heavy 55%.
                </p>
              </ScifiPanel>
              <ScifiPanel title="Formula" subtitle="TTK approximation" className="p-3">
                <p className="text-xs text-slate-500">
                  TTK = (shotsToKill - 1) / (RPM / 60)
                </p>
              </ScifiPanel>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
