/**
 * OutfitterPage — Ship loadout customizer + DPS calculator
 * Inspired by erkul.games DPS Calculator
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Settings2, X, Zap, Shield, Wind, Cpu, Search, RefreshCw, Copy, ExternalLink } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/services/api';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { useDebounce } from '@/hooks/useDebounce';
import { fNumber } from '@/utils/formatters';
import type { CompatibleComponent, LoadoutResult, ShipListItem } from '@/types/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PortEntry {
  port_id: number;
  port_name: string;
  port_type: string;
  port_min_size: number | null;
  port_max_size: number | null;
  component_uuid: string | null;
  component_name: string | null;
  display_name: string | null;
  component_type: string | null;
  component_size: number | null;
  grade: string | null;
  manufacturer_code: string | null;
  weapon_dps?: number | null;
  shield_hp?: number | null;
  power_output?: number | null;
  cooling_rate?: number | null;
  qd_speed?: number | null;
  swapped?: boolean;
}

interface LoadoutResult {
  ship: { uuid: string; name: string; class_name: string };
  stats: Record<string, unknown>;
  loadout: PortEntry[];
}

// ── Type icon mapping ─────────────────────────────────────────────────────────

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
  TractorBeam: '🔗',
  SalvageHead: '🔧',
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
  TractorBeam: 'text-teal-400',
  SalvageHead: 'text-lime-400',
};

function typeColor(t?: string | null) {
  return TYPE_COLOR[t ?? ''] ?? 'text-slate-400';
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
  port: PortEntry;
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
          {TYPE_ICON[port.port_type] ?? '⚙'} {port.port_type} · S{port.port_min_size ?? '?'}–S{port.port_max_size ?? '?'}
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
              <span className="text-base">{TYPE_ICON[comp.type] ?? '⚙'}</span>
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
              </div>
            </button>
          ))
        )}
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OutfitterPage() {
  const [shipSearch, setShipSearch]     = useState('');
  const [selectedShip, setSelectedShip] = useState<ShipListItem | null>(null);
  const [swaps, setSwaps]               = useState<Record<string, string>>({});  // portName → componentUuid
  const [activePort, setActivePort]     = useState<PortEntry | null>(null);
  const dShipSearch = useDebounce(shipSearch, 300);

  const { data: shipSuggestions } = useQuery({
    queryKey: ['ships.search', dShipSearch],
    queryFn: () => api.ships.search(dShipSearch, 8),
    enabled: dShipSearch.length >= 2 && !selectedShip,
  });

  const swapArray = useMemo(
    () => Object.entries(swaps).map(([portName, componentUuid]) => ({ portName, componentUuid })),
    [swaps],
  );

  const { mutate: calculate, data: loadout, isPending } = useMutation<
    LoadoutResult,
    Error,
    { uuid: string; swaps: { portName: string; componentUuid: string }[] }
  >({
    mutationFn: (args) => api.loadout.calculate(args.uuid, args.swaps),
  });

  const loadShip = useCallback((ship: ShipListItem) => {
    setSelectedShip(ship);
    setShipSearch('');
    setSwaps({});
    calculate({ uuid: ship.uuid, swaps: [] });
  }, [calculate]);

  const handleSwap = useCallback((comp: CompatibleComponent) => {
    if (!activePort || !selectedShip) return;
    const newSwaps = { ...swaps, [activePort.port_name]: comp.uuid };
    setSwaps(newSwaps);
    setActivePort(null);
    calculate({
      uuid: selectedShip.uuid,
      swaps: Object.entries(newSwaps).map(([portName, componentUuid]) => ({ portName, componentUuid })),
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
    const params = new URLSearchParams({ ship: selectedShip.uuid, ...swaps });
    navigator.clipboard.writeText(`${window.location.origin}/outfitter?${params}`);
  };

  // Aggregate stats from loadout result
  const stats = loadout?.stats;
  const totalDps    = stats?.weapons?.total_dps ?? 0;
  const totalShield = stats?.shields?.total_hp ?? 0;
  const powerDraw   = stats?.power?.total_draw ?? 0;
  const scmSpeed    = stats?.mobility?.scm_speed || null;

  const ports: PortEntry[] = (loadout?.loadout as PortEntry[] | undefined) ?? [];

  const portsByType = useMemo(() => {
    const map: Record<string, PortEntry[]> = {};
    for (const p of ports) {
      const key = p.component_type ?? p.port_type ?? 'Other';
      if (!map[key]) map[key] = [];
      map[key].push(p);
    }
    return map;
  }, [ports]);

  const hasSwaps = Object.keys(swaps).length > 0;

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
            <button onClick={() => { setSelectedShip(null); setSwaps({}); }} className="text-slate-600 hover:text-slate-300 transition-colors">
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
              {scmSpeed && <StatChip icon={Wind} label="SCM" value={fNumber(scmSpeed, 0) + ' m/s'} />}
              {powerDraw > 0 && <StatChip icon={Cpu} label="Power draw" value={fNumber(powerDraw, 0) + ' W'} accent="red" />}
              {hasSwaps && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-950/30 rounded border border-amber-900/60 text-amber-400 text-[10px] font-mono-sc uppercase">
                  ✦ {Object.keys(swaps).length} custom component{Object.keys(swaps).length > 1 ? 's' : ''}
                </div>
              )}
            </motion.div>
          )}

          {/* Port groups */}
          {loadout && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Object.entries(portsByType).map(([type, typePorts]) => (
                <ScifiPanel
                  key={type}
                  title={`${TYPE_ICON[type] ?? '⚙'} ${type}`}
                  subtitle={`${typePorts.length} slot${typePorts.length > 1 ? 's' : ''}`}
                >
                  <div className="space-y-1">
                    {typePorts.map(port => (
                      <div key={port.port_id} className="relative">
                        <button
                          onClick={() => setActivePort(activePort?.port_id === port.port_id ? null : port)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded border transition-all text-left ${
                            port.swapped
                              ? 'border-amber-800/60 bg-amber-950/20 hover:border-amber-700'
                              : activePort?.port_id === port.port_id
                              ? 'border-cyan-700 bg-cyan-950/30'
                              : 'border-slate-800 hover:border-slate-700 hover:bg-white/[0.02]'
                          }`}
                        >
                          <span className={`text-base ${typeColor(port.component_type)}`}>
                            {TYPE_ICON[port.component_type ?? ''] ?? TYPE_ICON[port.port_type] ?? '⚙'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-rajdhani font-semibold text-slate-200 truncate">
                                {port.display_name ?? port.component_name ?? '(empty)'}
                              </span>
                              {port.swapped && <span className="text-[9px] text-amber-500 font-mono-sc uppercase shrink-0">custom</span>}
                            </div>
                            <div className="text-[10px] text-slate-600 flex items-center gap-1.5">
                              <span className="font-mono-sc">{port.port_name}</span>
                              {port.port_min_size != null && (
                                <span>· S{port.port_min_size}{port.port_max_size !== port.port_min_size ? `–${port.port_max_size}` : ''}</span>
                              )}
                              {port.manufacturer_code && <span className="text-slate-700">{port.manufacturer_code}</span>}
                            </div>
                          </div>
                          <div className="text-right text-[10px] font-mono-sc shrink-0">
                            {port.weapon_dps != null && port.weapon_dps > 0 && (
                              <div className="text-red-400">{fNumber(port.weapon_dps, 1)} dps</div>
                            )}
                            {port.shield_hp != null && port.shield_hp > 0 && (
                              <div className="text-blue-400">{fNumber(port.shield_hp, 0)} hp</div>
                            )}
                          </div>
                          <ChevronRight size={12} className={`text-slate-700 shrink-0 transition-transform ${activePort?.port_id === port.port_id ? 'rotate-90' : ''}`} />
                        </button>

                        <AnimatePresence>
                          {activePort?.port_id === port.port_id && (
                            <ComponentPicker
                              port={port}
                              onSelect={handleSwap}
                              onClose={() => setActivePort(null)}
                            />
                          )}
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

          {/* Link to detail */}
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
