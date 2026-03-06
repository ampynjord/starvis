/**
 * OutfitterPage — Ship loadout customizer + DPS calculator
 * Inspired by erkul.games DPS Calculator
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronDown, Settings2, X, Zap, Shield, Wind, Cpu, Search, RefreshCw, Copy, ExternalLink } from 'lucide-react';
import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/services/api';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { useDebounce } from '@/hooks/useDebounce';
import { fNumber } from '@/utils/formatters';
import type { CompatibleComponent, HardpointEntry, HardpointComponent, LoadoutResult, ShipListItem } from '@/types/api';

// ── Active port context ───────────────────────────────────────────────────────

interface ActivePort {
  port_id: number;
  port_name: string;
  port_type: string;
  port_min_size: number | null;
  port_max_size: number | null;
}

// ── Type metadata ─────────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, string> = {
  WeaponGun: '🔫',
  Shield: '🛡',
  PowerPlant: '⚡',
  Cooler: '❄',
  QuantumDrive: '🌀',
  Countermeasure: '🎯',
  Missile: '🚀',
  MissileRack: '🚀',
  Radar: '📡',
  EMP: '⚡',
  MiningLaser: '⛏',
  MiningArm: '⛏',
  TractorBeam: '🔗',
  SalvageHead: '🔧',
  JumpModule: '🔀',
  Gimbal: '⚙',
  Turret: '🗼',
  TurretBase: '🗼',
};

const TYPE_COLOR: Record<string, string> = {
  WeaponGun: 'text-red-400',
  Shield: 'text-blue-400',
  PowerPlant: 'text-yellow-400',
  Cooler: 'text-cyan-400',
  QuantumDrive: 'text-purple-400',
  Countermeasure: 'text-orange-400',
  Missile: 'text-rose-400',
  Radar: 'text-slate-400',
  EMP: 'text-yellow-300',
  MiningLaser: 'text-amber-400',
  MiningArm: 'text-amber-400',
  TractorBeam: 'text-teal-400',
  SalvageHead: 'text-lime-400',
  JumpModule: 'text-violet-400',
  Gimbal: 'text-slate-500',
  Turret: 'text-slate-400',
};

const CATEGORY_ORDER = [
  'Weapons', 'Turrets', 'Missiles', 'Shields', 'Power Plants',
  'Coolers', 'Quantum Drive', 'Radar', 'EMP', 'QED',
  'Countermeasures', 'Mining', 'Salvage', 'Tractor', 'Repair', 'Other',
];

const CAT_ICON: Record<string, string> = {
  Weapons: '🔫', Turrets: '🗼', Missiles: '🚀', Shields: '🛡',
  'Power Plants': '⚡', Coolers: '❄', 'Quantum Drive': '🌀',
  Radar: '📡', EMP: '⚡', QED: '🌐', Countermeasures: '🎯',
  Mining: '⛏', Salvage: '🔧', Tractor: '🔗', Repair: '🩹', Other: '⚙',
};

function typeColor(t?: string | null) {
  return TYPE_COLOR[t ?? ''] ?? 'text-slate-400';
}

function typeIcon(t?: string | null) {
  return TYPE_ICON[t ?? ''] ?? '⚙';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatChip({ icon: Icon, label, value, accent = 'cyan' }: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent?: string;
}) {
  const accentCls = accent === 'red' ? 'text-red-400' : accent === 'blue' ? 'text-blue-400' : 'text-cyan-400';
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 rounded border border-slate-800">
      <Icon size={12} className={accentCls} />
      <span className="text-[10px] font-mono-sc text-slate-500 uppercase">{label}</span>
      <span className={`text-xs font-bold font-mono-sc ml-1 ${accentCls}`}>{value}</span>
    </div>
  );
}

function ComponentPicker({
  port,
  onSelect,
  onClose,
}: {
  port: ActivePort;
  onSelect: (comp: CompatibleComponent) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const dSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['compatible', port.port_type, port.port_min_size, port.port_max_size, dSearch],
    queryFn: () => api.components.compatible({
      type: port.port_type,
      min_size: port.port_min_size ?? undefined,
      max_size: port.port_max_size ?? undefined,
      search: dSearch || undefined,
      sort: 'size',
      order: 'asc',
    }),
    staleTime: 60_000,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="absolute z-50 top-full left-0 mt-1 w-[440px] bg-slate-950 border border-cyan-900/60 rounded-lg shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
        <span className="text-xs font-mono-sc text-slate-400 uppercase">
          {typeIcon(port.port_type)} {port.port_type}
          {port.port_min_size != null && <> · S{port.port_min_size}{port.port_max_size !== port.port_min_size ? `–${port.port_max_size}` : ''}</>}
        </span>
        <button onClick={onClose} className="text-slate-600 hover:text-slate-300 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-slate-800">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search component…"
            className="sci-input w-full pl-7 text-xs"
            autoFocus
          />
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto">
        {isLoading ? (
          <div className="py-6 text-center text-xs text-slate-600">Loading…</div>
        ) : !data?.length ? (
          <div className="py-6 text-center text-xs text-slate-600">No compatible components</div>
        ) : (
          data.map((comp: CompatibleComponent) => (
            <button
              key={comp.uuid}
              onClick={() => onSelect(comp)}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-800/60 text-left transition-colors border-b border-slate-900/40 last:border-0"
            >
              <span className="text-base">{typeIcon(comp.type)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-rajdhani font-semibold text-slate-200 truncate">{comp.name}</div>
                <div className="text-[10px] text-slate-600 flex items-center gap-2">
                  <span>S{comp.size}</span>
                  {comp.grade && <span className="text-amber-700">{comp.grade}</span>}
                  {comp.manufacturer_code && <span className="text-slate-700">{comp.manufacturer_code}</span>}
                </div>
              </div>
              <div className="text-right text-[10px] font-mono-sc shrink-0">
                {comp.weapon_dps != null && comp.weapon_dps > 0 && (
                  <div className="text-red-400">{fNumber(comp.weapon_dps, 1)} DPS</div>
                )}
                {comp.shield_hp != null && comp.shield_hp > 0 && (
                  <div className="text-blue-400">{fNumber(comp.shield_hp, 0)} HP</div>
                )}
                {comp.power_output != null && comp.power_output > 0 && (
                  <div className="text-yellow-400">{fNumber(comp.power_output, 0)} W</div>
                )}
                {comp.cooling_rate != null && comp.cooling_rate > 0 && (
                  <div className="text-cyan-400">{fNumber(comp.cooling_rate / 1000, 1)}k cool</div>
                )}
                {comp.qd_speed != null && comp.qd_speed > 0 && (
                  <div className="text-purple-400">{fNumber(comp.qd_speed / 1_000_000, 1)} Mm/s</div>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </motion.div>
  );
}

// ── ComponentRow — renders a component slot (possibly with sub-items) ─────────

function ComponentRow({
  comp,
  swappedIds,
  activePortId,
  onOpenPicker,
  depth = 0,
}: {
  comp: HardpointComponent;
  swappedIds: Set<number>;
  activePortId: number | null;
  onOpenPicker: (port: ActivePort) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasSubItems = comp.sub_items && comp.sub_items.length > 0;
  const isSwapped = swappedIds.has(comp.port_id);
  const isActive = activePortId === comp.port_id;
  const compType = comp.type ?? '';
  const isEmpty = !comp.uuid;

  const statLabel = (() => {
    if (comp.weapon_dps && comp.weapon_dps > 0) return <span className="text-red-400">{fNumber(comp.weapon_dps, 1)} dps</span>;
    if (comp.shield_hp && comp.shield_hp > 0) return <span className="text-blue-400">{fNumber(comp.shield_hp, 0)} hp</span>;
    if (comp.power_output && comp.power_output > 0) return <span className="text-yellow-400">{fNumber(comp.power_output, 0)} W</span>;
    if (comp.cooling_rate && comp.cooling_rate > 0) return <span className="text-cyan-400">{fNumber(comp.cooling_rate / 1000, 1)}k cool</span>;
    if (comp.qd_speed && comp.qd_speed > 0) return <span className="text-purple-400">{fNumber(comp.qd_speed / 1_000_000, 1)} Mm/s</span>;
    if (comp.missile_damage && comp.missile_damage > 0) return <span className="text-rose-400">{fNumber(comp.missile_damage, 0)} dmg</span>;
    return null;
  })();

  return (
    <div>
      {depth > 0 && (
        <div className="flex items-stretch" style={{ paddingLeft: (depth - 1) * 16 }}>
          <div className="w-3 shrink-0 border-l border-b border-slate-800 rounded-bl mb-2 mr-1" />
          <div className="flex-1">
            <SlotButton
              comp={comp}
              compType={compType}
              isEmpty={isEmpty}
              isSwapped={isSwapped}
              isActive={isActive}
              statLabel={statLabel}
              onOpenPicker={onOpenPicker}
            />
          </div>
        </div>
      )}
      {depth === 0 && (
        <SlotButton
          comp={comp}
          compType={compType}
          isEmpty={isEmpty}
          isSwapped={isSwapped}
          isActive={isActive}
          statLabel={statLabel}
          onOpenPicker={onOpenPicker}
        />
      )}

      {hasSubItems && (
        <div style={{ paddingLeft: depth * 16 + 8 }}>
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-400 px-2 py-0.5 transition-colors"
          >
            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <span className="font-mono-sc">{comp.sub_items!.length} sub-component{comp.sub_items!.length > 1 ? 's' : ''}</span>
          </button>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-0.5 mt-0.5">
                  {comp.sub_items!.map(sub => (
                    <ComponentRow
                      key={sub.port_id}
                      comp={sub}
                      swappedIds={swappedIds}
                      activePortId={activePortId}
                      onOpenPicker={onOpenPicker}
                      depth={depth + 1}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function SlotButton({
  comp,
  compType,
  isEmpty,
  isSwapped,
  isActive,
  statLabel,
  onOpenPicker,
}: {
  comp: HardpointComponent;
  compType: string;
  isEmpty: boolean;
  isSwapped: boolean;
  isActive: boolean;
  statLabel: React.ReactNode;
  onOpenPicker: (port: ActivePort) => void;
}) {
  return (
    <button
      onClick={() => onOpenPicker({
        port_id: comp.port_id,
        port_name: comp.port_name,
        port_type: compType || 'WeaponGun',
        port_min_size: comp.port_min_size,
        port_max_size: comp.port_max_size,
      })}
      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded border transition-all text-left ${
        isSwapped
          ? 'border-amber-800/60 bg-amber-950/20 hover:border-amber-700'
          : isActive
          ? 'border-cyan-700 bg-cyan-950/30'
          : isEmpty
          ? 'border-slate-800/40 border-dashed hover:border-slate-600 hover:bg-white/[0.01]'
          : 'border-slate-800 hover:border-slate-700 hover:bg-white/[0.02]'
      }`}
    >
      <span className={`text-sm shrink-0 ${typeColor(compType)}`}>{typeIcon(compType)}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-xs font-rajdhani font-semibold truncate ${isEmpty ? 'text-slate-700 italic' : 'text-slate-200'}`}>
            {comp.display_name ?? comp.name ?? (isEmpty ? '(empty)' : comp.port_name)}
          </span>
          {isSwapped && <span className="text-[9px] text-amber-500 font-mono-sc uppercase shrink-0">custom</span>}
        </div>
        <div className="text-[10px] text-slate-600 flex items-center gap-1.5 flex-wrap">
          <span className="font-mono-sc truncate max-w-[120px]">{comp.port_name}</span>
          {comp.size != null && <span>· S{comp.size}</span>}
          {comp.grade && <span className="text-amber-700/70">{comp.grade}</span>}
          {comp.manufacturer_code && <span className="text-slate-700">{comp.manufacturer_code}</span>}
        </div>
      </div>
      {statLabel && <div className="text-[10px] font-mono-sc shrink-0">{statLabel}</div>}
      <ChevronRight size={11} className={`text-slate-700 shrink-0 transition-transform ${isActive ? 'rotate-90' : ''}`} />
    </button>
  );
}

// ── HardpointRow — top-level hardpoint (mount or direct component) ────────────

function HardpointRow({
  hp,
  swappedIds,
  activePortId,
  onOpenPicker,
}: {
  hp: HardpointEntry;
  swappedIds: Set<number>;
  activePortId: number | null;
  onOpenPicker: (port: ActivePort) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isMounted = hp.mount_type !== null;
  const mountLabel = isMounted
    ? `${hp.mount_type}${hp.mount_size ? ` S${hp.mount_size}` : ''}`
    : null;

  // Cas 1: composant direct (ex: Shield, PowerPlant — sans enfants)
  if (!isMounted && hp.component && hp.items.length === 0) {
    return (
      <ComponentRow
        comp={hp.component}
        swappedIds={swappedIds}
        activePortId={activePortId}
        onOpenPicker={onOpenPicker}
        depth={0}
      />
    );
  }

  // Cas 1b: composant direct + sous-slots (ex: QuantumDrive → JumpModule)
  if (!isMounted && hp.items.length > 0) {
    return (
      <div>
        {hp.component && (
          <ComponentRow
            comp={hp.component}
            swappedIds={swappedIds}
            activePortId={activePortId}
            onOpenPicker={onOpenPicker}
            depth={0}
          />
        )}
        <div className={`space-y-0.5 ${hp.component ? 'mt-0.5 ml-4 border-l border-slate-800 pl-3' : ''}`}>
          {hp.items.map(item => (
            <ComponentRow
              key={item.port_id}
              comp={item}
              swappedIds={swappedIds}
              activePortId={activePortId}
              onOpenPicker={onOpenPicker}
              depth={0}
            />
          ))}
        </div>
      </div>
    );
  }

  // Cas 2: mount avec items (Gimbal, Turret, Rack…)
  if (isMounted && hp.items.length > 0) {
    return (
      <div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded border border-slate-800/60 bg-slate-900/20 hover:border-slate-700 transition-colors text-left"
        >
          <span className="text-sm shrink-0 text-slate-500">⚙</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-rajdhani font-semibold text-slate-400 truncate">{hp.display_name}</div>
            <div className="text-[10px] text-slate-600 flex items-center gap-1.5">
              {mountLabel && <span className="font-mono-sc text-slate-700">{mountLabel}</span>}
              <span className="text-slate-700">{hp.items.length} slot{hp.items.length > 1 ? 's' : ''}</span>
            </div>
          </div>
          {expanded ? <ChevronDown size={11} className="text-slate-700 shrink-0" /> : <ChevronRight size={11} className="text-slate-700 shrink-0" />}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-0.5 ml-4 space-y-0.5 border-l border-slate-800 pl-3">
                {hp.items.map(item => (
                  <ComponentRow
                    key={item.port_id}
                    comp={item}
                    swappedIds={swappedIds}
                    activePortId={activePortId}
                    onOpenPicker={onOpenPicker}
                    depth={0}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Cas 3: mount vide
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-dashed border-slate-800/30 text-slate-700">
      <span className="text-sm">⚙</span>
      <span className="text-xs font-rajdhani truncate">{hp.display_name}</span>
      {mountLabel && <span className="text-[10px] font-mono-sc ml-auto shrink-0">{mountLabel}</span>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OutfitterPage() {
  const [shipSearch, setShipSearch]     = useState('');
  const [selectedShip, setSelectedShip] = useState<ShipListItem | null>(null);
  // swaps: portId (number) → componentUuid
  const [swaps, setSwaps]               = useState<Record<number, string>>({});
  const [activePort, setActivePort]     = useState<ActivePort | null>(null);
  const dShipSearch = useDebounce(shipSearch, 300);

  const { data: shipSuggestions } = useQuery({
    queryKey: ['ships.search', dShipSearch],
    queryFn: () => api.ships.search(dShipSearch, 8),
    enabled: dShipSearch.length >= 2 && !selectedShip,
  });

  const { mutate: calculate, data: loadout, isPending } = useMutation<
    LoadoutResult,
    Error,
    { uuid: string; swaps: { portId: number; componentUuid: string }[] }
  >({
    mutationFn: (args) => api.loadout.calculate(args.uuid, args.swaps),
  });

  const loadShip = useCallback((ship: ShipListItem) => {
    setSelectedShip(ship);
    setShipSearch('');
    setSwaps({});
    setActivePort(null);
    calculate({ uuid: ship.uuid, swaps: [] });
  }, [calculate]);

  const handleSwap = useCallback((comp: CompatibleComponent) => {
    if (!activePort || !selectedShip) return;
    const newSwaps = { ...swaps, [activePort.port_id]: comp.uuid };
    setSwaps(newSwaps);
    setActivePort(null);
    calculate({
      uuid: selectedShip.uuid,
      swaps: Object.entries(newSwaps).map(([portId, componentUuid]) => ({
        portId: Number(portId),
        componentUuid,
      })),
    });
  }, [activePort, selectedShip, swaps, calculate]);

  const handleReset = useCallback(() => {
    if (!selectedShip) return;
    setSwaps({});
    setActivePort(null);
    calculate({ uuid: selectedShip.uuid, swaps: [] });
  }, [selectedShip, calculate]);

  const copyLoadoutUrl = () => {
    if (!selectedShip) return;
    const swapEntries = Object.entries(swaps).map(([id, uuid]) => `${id}:${uuid}`).join(',');
    const params = new URLSearchParams({ ship: selectedShip.uuid });
    if (swapEntries) params.set('swaps', swapEntries);
    navigator.clipboard.writeText(`${window.location.origin}/outfitter?${params}`);
  };

  const stats = loadout?.stats;
  const totalDps    = stats?.weapons?.total_dps ?? 0;
  const totalShield = stats?.shields?.total_hp ?? 0;
  const powerDraw   = stats?.power?.total_draw ?? 0;
  const scmSpeed    = stats?.mobility?.scm_speed || null;
  const hasSwaps    = Object.keys(swaps).length > 0;

  // Group hardpoints by category, respecting CATEGORY_ORDER
  const hardpointsByCategory = (() => {
    if (!loadout?.hardpoints) return [];
    const map = new Map<string, HardpointEntry[]>();
    for (const hp of loadout.hardpoints) {
      const cat = hp.category ?? 'Other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(hp);
    }
    return CATEGORY_ORDER
      .filter(cat => map.has(cat))
      .map(cat => ({ category: cat, hardpoints: map.get(cat)! }));
  })();

  // Set of swapped port ids for visual feedback
  const swappedIds = new Set(Object.keys(swaps).map(Number));

  return (
    <div className="max-w-screen-xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase flex items-center gap-2">
            <Settings2 size={18} />
            Ship Outfitter
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Customize your loadout and calculate DPS in real time</p>
        </div>
        {selectedShip && (
          <div className="flex items-center gap-2">
            {hasSwaps && (
              <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 border border-slate-800 hover:border-slate-600 rounded transition-all">
                <RefreshCw size={12} /> Reset loadout
              </button>
            )}
            <button onClick={copyLoadoutUrl} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-cyan-600 hover:text-cyan-400 border border-cyan-900 hover:border-cyan-700 rounded transition-all">
              <Copy size={12} /> Copy link
            </button>
          </div>
        )}
      </div>

      {/* Ship selector */}
      <ScifiPanel title="Select Ship">
        {selectedShip ? (
          <div className="flex items-center gap-3">
            {selectedShip.thumbnail && (
              <img src={selectedShip.thumbnail} alt={selectedShip.name ?? ''} className="w-20 h-12 object-cover rounded opacity-80" />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-rajdhani font-bold text-slate-100">{selectedShip.name}</span>
                {selectedShip.manufacturer_code && <GlowBadge color="cyan" size="xs">{selectedShip.manufacturer_code}</GlowBadge>}
              </div>
              <p className="text-xs text-slate-500">{selectedShip.role} • {selectedShip.career}</p>
            </div>
            <button onClick={() => { setSelectedShip(null); setSwaps({}); setActivePort(null); }} className="text-slate-600 hover:text-slate-300 transition-colors">
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
            <input
              type="text"
              value={shipSearch}
              onChange={e => setShipSearch(e.target.value)}
              placeholder="Search for a ship…"
              className="sci-input w-full pl-8 text-sm"
              autoFocus
            />
            <AnimatePresence>
              {shipSuggestions && shipSuggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl overflow-hidden"
                >
                  {shipSuggestions.map(ship => (
                    <button
                      key={ship.uuid}
                      onClick={() => loadShip(ship)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800/60 text-left transition-colors border-b border-slate-900 last:border-0"
                    >
                      {ship.thumbnail ? (
                        <img src={ship.thumbnail} alt="" className="w-10 h-6 object-cover rounded opacity-70 shrink-0" />
                      ) : (
                        <div className="w-10 h-6 bg-slate-800 rounded shrink-0" />
                      )}
                      <div>
                        <div className="text-sm font-rajdhani font-semibold text-slate-200">{ship.name}</div>
                        <div className="text-[10px] text-slate-600">{ship.manufacturer_code} · {ship.role}</div>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </ScifiPanel>

      {selectedShip && (
        <>
          {/* Stats summary */}
          {isPending ? (
            <LoadingGrid message="COMPUTING LOADOUT…" />
          ) : loadout && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap gap-2">
              {totalDps > 0 && <StatChip icon={Zap} label="Total DPS" value={fNumber(totalDps, 1)} accent="red" />}
              {totalShield > 0 && <StatChip icon={Shield} label="Shield HP" value={fNumber(totalShield, 0)} accent="blue" />}
              {scmSpeed != null && scmSpeed > 0 && <StatChip icon={Wind} label="SCM" value={fNumber(scmSpeed, 0) + ' m/s'} />}
              {powerDraw > 0 && <StatChip icon={Cpu} label="Power draw" value={fNumber(powerDraw, 0) + ' W'} accent="red" />}
              {hasSwaps && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-950/30 rounded border border-amber-900/60 text-amber-400 text-[10px] font-mono-sc uppercase">
                  ✦ {Object.keys(swaps).length} custom component{Object.keys(swaps).length > 1 ? 's' : ''}
                </div>
              )}
            </motion.div>
          )}

          {/* Hardpoints by category */}
          {loadout && hardpointsByCategory.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {hardpointsByCategory.map(({ category, hardpoints }) => (
                <ScifiPanel
                  key={category}
                  title={`${CAT_ICON[category] ?? '⚙'} ${category}`}
                  subtitle={`${hardpoints.length} hardpoint${hardpoints.length > 1 ? 's' : ''}`}
                >
                  <div className="space-y-1.5">
                    {hardpoints.map(hp => (
                      <div key={hp.port_id} className="relative">
                        <HardpointRow
                          hp={hp}
                          swappedIds={swappedIds}
                          activePortId={activePort?.port_id ?? null}
                          onOpenPicker={port => setActivePort(activePort?.port_id === port.port_id ? null : port)}
                        />
                        <AnimatePresence>
                          {activePort != null && (() => {
                            const matchesThis =
                              hp.component?.port_id === activePort.port_id ||
                              hp.items.some(i =>
                                i.port_id === activePort.port_id ||
                                i.sub_items?.some(s => s.port_id === activePort.port_id)
                              );
                            if (!matchesThis) return null;
                            return (
                              <ComponentPicker
                                key="picker"
                                port={activePort}
                                onSelect={handleSwap}
                                onClose={() => setActivePort(null)}
                              />
                            );
                          })()}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </ScifiPanel>
              ))}
            </div>
          )}

          {!loadout && !isPending && (
            <div className="text-center py-12 text-slate-600 text-sm">
              Select a ship above to start customizing
            </div>
          )}

          {selectedShip && (
            <div className="text-right">
              <Link to={`/ships/${selectedShip.uuid}`} className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-cyan-400 transition-colors">
                <ExternalLink size={12} /> View full ship page
              </Link>
            </div>
          )}
        </>
      )}

      {!selectedShip && !shipSearch && (
        <div className="text-center py-16 text-slate-700 text-sm font-rajdhani">
          Search for a ship to start building your loadout
        </div>
      )}
    </div>
  );
}
