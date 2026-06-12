'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Crosshair, Shield, SlidersHorizontal, Target } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import type { ItemListItem, WeaponAttachmentModifier } from '@/types/api';

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

function formatEffectValue(value: number): string {
  if (value === 0) return '0%';
  return `${value > 0 ? '+' : ''}${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
}

function attachmentLabel(attachment: WeaponAttachmentModifier): string {
  const effects = attachment.effects.map((effect) => `${effect.label} ${formatEffectValue(effect.value)}`).join(', ');
  return effects ? `${attachment.display_name} (${effects})` : `${attachment.display_name} (no stat modifier)`;
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
  const [selectedBarrelAttachmentUuid, setSelectedBarrelAttachmentUuid] = useState<string>('');
  const [selectedUnderbarrelAttachmentUuid, setSelectedUnderbarrelAttachmentUuid] = useState<string>('');

  const { data: itemFilters, isLoading: loadingFilters } = useQuery({
    queryKey: ['items.filters', env],
    queryFn: () => api.items.filters(env),
    staleTime: Infinity,
  });

  const weaponTypes = useMemo(() => {
    const allTypes = (itemFilters?.types ?? []).filter(Boolean);
    return allTypes.filter((t) => /(weapon|gun|rifle|pistol|shotgun|smg|sniper|launcher)/i.test(t));
  }, [itemFilters]);

  const { data: attachmentModifiers = [] } = useQuery({
    queryKey: ['fps.attachment-modifiers', env],
    queryFn: () => api.items.weaponAttachmentModifiers(env),
    staleTime: Infinity,
  });

  const { data: weaponListData, isLoading: loadingWeaponList, error: weaponsError, refetch: refetchWeapons } = useQuery({
    queryKey: ['fps.weapon-list', env, weaponTypes.join(',')],
    queryFn: () => api.items.list({ env, page: 1, limit: 200, types: weaponTypes.join(',') || undefined }),
    enabled: weaponTypes.length > 0,
  });

  const loadingWeapons = loadingFilters || (weaponTypes.length > 0 && loadingWeaponList);

  const weapons = useMemo<WeaponSummary[]>(() => {
    const rows = (weaponListData?.data ?? []) as ItemListItem[];
    return rows.map((w) => ({
      uuid: w.uuid,
      name: w.displayName ?? w.display_name ?? w.name,
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

  const barrelAttachments = useMemo(
    () => attachmentModifiers.filter((attachment) => attachment.slot === 'barrel'),
    [attachmentModifiers],
  );

  const underbarrelAttachments = useMemo(
    () => attachmentModifiers.filter((attachment) => attachment.slot === 'underbarrel'),
    [attachmentModifiers],
  );

  const selectedBarrelAttachment = useMemo(
    () => attachmentModifiers.find((attachment) => attachment.uuid === selectedBarrelAttachmentUuid) ?? null,
    [attachmentModifiers, selectedBarrelAttachmentUuid],
  );

  const selectedUnderbarrelAttachment = useMemo(
    () => attachmentModifiers.find((attachment) => attachment.uuid === selectedUnderbarrelAttachmentUuid) ?? null,
    [attachmentModifiers, selectedUnderbarrelAttachmentUuid],
  );

  const selectedAttachments = useMemo(
    () => [selectedBarrelAttachment, selectedUnderbarrelAttachment].filter((attachment): attachment is WeaponAttachmentModifier => !!attachment),
    [selectedBarrelAttachment, selectedUnderbarrelAttachment],
  );

  const barrelRateBonus = useMemo(
    () => selectedAttachments.reduce((sum, attachment) => sum + attachment.fire_rate_bonus, 0),
    [selectedAttachments],
  );

  const underbarrelDamageBonus = useMemo(
    () => selectedAttachments.reduce((sum, attachment) => sum + attachment.damage_bonus, 0),
    [selectedAttachments],
  );

  const { data: computed } = useQuery({
    queryKey: ['fps.calculate', env, selectedWeapon?.uuid, fireMode, hitbox, armorClass, health, barrelRateBonus, underbarrelDamageBonus, craftedMitigationBonus],
    queryFn: () =>
      api.calculate.fpsDamage({
        itemUuid: selectedWeapon!.uuid,
        env,
        fireMode,
        hitbox,
        armorClass,
        health,
        barrelRateBonus,
        underbarrelDamageBonus,
        craftedMitigationBonus,
      }),
    enabled: !!selectedWeapon?.uuid,
  });

  const axisMax = useMemo(() => {
    if (!computed) return 3;
    if (computed.ttk <= 3) return 3;
    return Math.ceil(computed.ttk);
  }, [computed]);

  return (
    <PageShell>
      <PageHeader title="FPS Calculator" subtitle="Weapon damage and TTK analysis with attachments, mitigation and hitbox simulation." />

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

            <ScifiPanel title="Attachments & Crafting" subtitle="Real attachment modifiers from game data">
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 font-mono-sc uppercase tracking-wider">
                    Barrel attachment
                  </label>
                  <select
                    className="sci-select w-full text-xs"
                    value={selectedBarrelAttachmentUuid}
                    onChange={(e) => setSelectedBarrelAttachmentUuid(e.target.value)}
                  >
                    <option value="">No barrel attachment</option>
                    {barrelAttachments.map((attachment) => (
                      <option key={attachment.uuid} value={attachment.uuid}>
                        {attachmentLabel(attachment)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 font-mono-sc uppercase tracking-wider">
                    Underbarrel attachment
                  </label>
                  <select
                    className="sci-select w-full text-xs"
                    value={selectedUnderbarrelAttachmentUuid}
                    onChange={(e) => setSelectedUnderbarrelAttachmentUuid(e.target.value)}
                  >
                    <option value="">No underbarrel attachment</option>
                    {underbarrelAttachments.map((attachment) => (
                      <option key={attachment.uuid} value={attachment.uuid}>
                        {attachmentLabel(attachment)}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedAttachments.length > 0 && (
                  <div className="space-y-1.5 border-t border-border pt-3">
                    {selectedAttachments.map((attachment) => (
                      <div key={attachment.uuid} className="text-[11px] text-slate-500">
                        <span className="text-slate-300">{attachment.display_name}</span>
                        {attachment.effects.length > 0 ? (
                          <span className="block font-mono-sc">
                            {attachment.effects.map((effect) => `${effect.label} ${formatEffectValue(effect.value)}`).join(' / ')}
                          </span>
                        ) : (
                          <span className="block font-mono-sc text-slate-600">No extracted stat modifier.</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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

                  {/* Magazine, Range, Damage Breakdown */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {computed.magazineSize != null && (
                      <div className="sci-panel p-3">
                        <div className="text-[10px] text-slate-600 font-mono-sc uppercase">Magazine</div>
                        <div className="font-orbitron text-lg text-purple-300">{computed.magazineSize}</div>
                        <div className="text-[10px] text-slate-600 mt-1">
                          {computed.magazineSize > 0 && computed.shotsToKill > 0 ? `${Math.ceil(computed.shotsToKill / computed.magazineSize)} reload${Math.ceil(computed.shotsToKill / computed.magazineSize) > 1 ? 's' : ''}` : '—'}
                        </div>
                      </div>
                    )}
                    {computed.effectiveRange != null && (
                      <div className="sci-panel p-3">
                        <div className="text-[10px] text-slate-600 font-mono-sc uppercase">Range</div>
                        <div className="font-orbitron text-lg text-blue-300">{computed.effectiveRange}m</div>
                      </div>
                    )}
                    {(computed.damagePhysical > 0 || computed.damageEnergy > 0 || computed.damageDistortion > 0) && (
                      <div className="sci-panel p-3 col-span-2">
                        <div className="text-[10px] text-slate-600 font-mono-sc uppercase mb-1">Damage Split</div>
                        <div className="flex gap-3 text-xs font-mono-sc">
                          {computed.damagePhysical > 0 && <span className="text-orange-300">Phys: {computed.damagePhysical}</span>}
                          {computed.damageEnergy > 0 && <span className="text-yellow-300">Energy: {computed.damageEnergy}</span>}
                          {computed.damageDistortion > 0 && <span className="text-purple-300">Dist: {computed.damageDistortion}</span>}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="sci-panel p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono-sc text-slate-500 uppercase tracking-wider">
                        TTK visualization
                      </span>
                      <span className="text-xs text-slate-600">0s - {axisMax}s</span>
                    </div>

                    <div className="relative h-14 border border-border rounded-sm bg-panel overflow-hidden">
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
                            className="absolute bottom-1 w-1.5 h-8 bg-cyan-400/70 border border-cyan-300/80 rounded-xs"
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
                        {computed.damagePhysical > 0 && <div className="flex justify-between"><span className="text-slate-600">Physical</span><span className="text-orange-300">{computed.damagePhysical}</span></div>}
                        {computed.damageEnergy > 0 && <div className="flex justify-between"><span className="text-slate-600">Energy</span><span className="text-yellow-300">{computed.damageEnergy}</span></div>}
                        {computed.damageDistortion > 0 && <div className="flex justify-between"><span className="text-slate-600">Distortion</span><span className="text-purple-300">{computed.damageDistortion}</span></div>}
                        {computed.magazineSize != null && <div className="flex justify-between"><span className="text-slate-600">Magazine</span><span>{computed.magazineSize}</span></div>}
                        {computed.effectiveRange != null && <div className="flex justify-between"><span className="text-slate-600">Range</span><span>{computed.effectiveRange}m</span></div>}
                        <div className="flex justify-between"><span className="text-slate-600">Mitigation</span><span>{computed.reductionPct}%</span></div>
                      </div>
                    </ScifiPanel>

                    <ScifiPanel title="Active Modifiers" className="p-3" actions={<SlidersHorizontal size={14} className="text-cyan-500" />}>
                      {selectedAttachments.length > 0 && (
                        <ul className="space-y-1 mb-3">
                          {selectedAttachments.map((attachment) => (
                            <li key={attachment.uuid} className="text-xs text-slate-300 flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5" />
                              <span>
                                <span className="block">{attachment.display_name}</span>
                                <span className="block text-[10px] text-slate-600 font-mono-sc">
                                  {attachment.effects.length
                                    ? attachment.effects.map((effect) => `${effect.label} ${formatEffectValue(effect.value)}`).join(' / ')
                                    : 'No extracted stat modifier'}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {computed.activeModifiers.length === 0 ? (
                        <p className="text-xs text-slate-600">
                          {selectedAttachments.length > 0 ? 'No active DPS/TTK modifiers.' : 'No active modifiers.'}
                        </p>
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
    </PageShell>
  );
}
