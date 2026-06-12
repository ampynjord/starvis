'use client';

export const dynamic = 'force-dynamic';

import {
  Copy,
  Crosshair,
  Flag,
  Layers3,
  Loader2,
  Plus,
  Radar,
  Save,
  Shield,
  Ship,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import createDynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { FleetShip, TacticalMarker, TacticalVector } from '@/components/ship/FleetHoloViewer';
import { api } from '@/services/api';
import type { ShipListItem } from '@/types/api';

const FleetHoloViewer = createDynamic(
  () => import('@/components/ship/FleetHoloViewer').then((m) => m.FleetHoloViewer),
  { ssr: false },
);

interface FleetItem {
  id: number;
  shipUuid: string | null;
  itemClassName: string;
  addedBy: { id: number; username: string } | null;
}

interface Corp {
  id: number;
  name: string;
  tag: string;
}

interface TacticalShip {
  id: number;
  fleetItemId: number;
  shipUuid: string;
  label: string;
  owner: string | null;
  group: string;
  gridX: number;
  gridZ: number;
}

interface Strategy {
  id: string;
  name: string;
  ships: TacticalShip[];
  markers: TacticalMarker[];
  vectors: TacticalVector[];
  updatedAt: string;
}

type FormationType = 'line' | 'wedge' | 'box';
type MarkerType = TacticalMarker['type'];

const getShipUuid = (item: FleetItem) => item.shipUuid?.trim() || null;
const makeId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const nowIso = () => new Date().toISOString();

const defaultStrategy = (): Strategy => ({
  id: makeId(),
  name: 'New strategy',
  ships: [],
  markers: [],
  vectors: [],
  updatedAt: nowIso(),
});

function formationPosition(index: number, total: number, spacing: number, formation: FormationType, offset: number) {
  const gap = Math.max(spacing, 22);
  if (formation === 'line') {
    return { gridX: (index - (total - 1) / 2) * gap + offset, gridZ: offset * 0.35 };
  }
  if (formation === 'box') {
    const cols = Math.ceil(Math.sqrt(total));
    const row = Math.floor(index / cols);
    const col = index % cols;
    const rows = Math.ceil(total / cols);
    return {
      gridX: (col - (cols - 1) / 2) * gap + offset,
      gridZ: (row - (rows - 1) / 2) * gap + offset * 0.35,
    };
  }
  const row = Math.floor((Math.sqrt(8 * index + 1) - 1) / 2);
  const rowStart = (row * (row + 1)) / 2;
  const col = index - rowStart;
  const rowWidth = row + 1;
  return {
    gridX: (col - (rowWidth - 1) / 2) * gap + offset,
    gridZ: row * gap * 0.82 + offset * 0.35,
  };
}

export default function CorporationTacticsPage() {
  const { user } = useAuth();
  const [corp, setCorp] = useState<Corp | null>(null);
  const [fleetItems, setFleetItems] = useState<FleetItem[]>([]);
  const [shipData, setShipData] = useState<Map<string, ShipListItem>>(new Map());
  const [strategies, setStrategies] = useState<Strategy[]>([defaultStrategy()]);
  const [activeStrategyId, setActiveStrategyId] = useState<string>('');
  const [selectedShipId, setSelectedShipId] = useState<number | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedVectorId, setSelectedVectorId] = useState<string | null>(null);
  const [shipQuery, setShipQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [storageKey, setStorageKey] = useState('');
  const [formationShipId, setFormationShipId] = useState<number | null>(null);
  const [formationName, setFormationName] = useState('Squadron');
  const [formationType, setFormationType] = useState<FormationType>('wedge');
  const [formationQuantity, setFormationQuantity] = useState(4);
  const [formationSpacing, setFormationSpacing] = useState(28);
  const nextShipIdRef = useRef(1);

  const activeStrategy = strategies.find((strategy) => strategy.id === activeStrategyId) ?? strategies[0] ?? defaultStrategy();

  const updateActiveStrategy = useCallback((updater: (strategy: Strategy) => Strategy) => {
    setStrategies((prev) => prev.map((strategy) => (
      strategy.id === activeStrategy.id ? { ...updater(strategy), updatedAt: nowIso() } : strategy
    )));
  }, [activeStrategy.id]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const fleetRes = await fetch('/api/corp/fleet');
        const data = await fleetRes.json().catch(() => ({}));
        if (!fleetRes.ok || cancelled) return;
        const items: FleetItem[] = data.data ?? [];
        const nextCorp: Corp | null = data.corporation ?? null;
        setCorp(nextCorp);
        setFleetItems(items);
        const firstShip = items.find((item) => getShipUuid(item));
        setFormationShipId(firstShip?.id ?? null);

        if (!nextCorp) {
          setStorageKey('');
          setStrategies([defaultStrategy()]);
          setActiveStrategyId('');
          setShipData(new Map());
          return;
        }

        const key = `starvis-corp-tactics-3d-${nextCorp.id}`;
        setStorageKey(key);
        const saved = localStorage.getItem(key);
        const parsed = saved ? JSON.parse(saved) as { activeStrategyId?: string; strategies?: Strategy[] } : null;
        const loadedStrategies = (parsed?.strategies?.length ? parsed.strategies : [defaultStrategy()])
          .map((strategy) => ({ ...strategy, vectors: strategy.vectors ?? [] }));
        setStrategies(loadedStrategies);
        setActiveStrategyId(parsed?.activeStrategyId && loadedStrategies.some((s) => s.id === parsed.activeStrategyId)
          ? parsed.activeStrategyId
          : loadedStrategies[0].id);
        nextShipIdRef.current = Math.max(1, ...loadedStrategies.flatMap((strategy) => strategy.ships.map((ship) => ship.id + 1)));

        const uuids = [...new Set(items.map(getShipUuid).filter(Boolean))] as string[];
        const entries = await Promise.allSettled(uuids.map(async (uuid) => [uuid, await api.ships.get(uuid)] as const));
        if (cancelled) return;
        const map = new Map<string, ShipListItem>();
        entries.forEach((entry) => {
          if (entry.status === 'fulfilled' && entry.value[1]) map.set(entry.value[0], entry.value[1] as unknown as ShipListItem);
        });
        setShipData(map);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user || !storageKey || !activeStrategyId) return;
    localStorage.setItem(storageKey, JSON.stringify({ activeStrategyId, strategies }));
  }, [activeStrategyId, storageKey, strategies, user]);

  const filteredFleet = useMemo(() => {
    const q = shipQuery.trim().toLowerCase();
    return fleetItems
      .filter((item) => getShipUuid(item))
      .filter((item) => {
        if (!q) return true;
        const uuid = getShipUuid(item);
        const ship = uuid ? shipData.get(uuid) : null;
        return `${ship?.name ?? item.itemClassName} ${ship?.role ?? ''} ${item.addedBy?.username ?? ''}`.toLowerCase().includes(q);
      });
  }, [fleetItems, shipData, shipQuery]);

  const tacticShips: FleetShip[] = useMemo(() => activeStrategy.ships.map((node) => {
    const ship = shipData.get(node.shipUuid);
    return {
      id: node.id,
      shipUuid: node.shipUuid,
      name: node.label || ship?.name || node.shipUuid,
      className: ship?.class_name ?? node.shipUuid,
      manufacturerCode: ship?.manufacturer_code ?? null,
      role: ship?.role ?? null,
      career: ship?.career ?? null,
      crewSize: ship?.crew_size ?? null,
      scmSpeed: ship?.scm_speed ?? null,
      sizeX: (ship as any)?.size_x ?? ship?.cross_section_x ?? null,
      sizeY: (ship as any)?.size_y ?? ship?.cross_section_y ?? null,
      sizeZ: (ship as any)?.size_z ?? ship?.cross_section_z ?? null,
      isConceptOnly: ship?.is_concept_only ?? false,
      thumbnailUrl: ship?.thumbnail_large ?? ship?.thumbnail ?? null,
      ctmUrl: ship?.ctm_url ? `/api/v1/ships/${node.shipUuid}/model/file` : null,
      declaredBy: node.owner,
      group: node.group,
      gridX: node.gridX,
      gridZ: node.gridZ,
    } satisfies FleetShip;
  }), [activeStrategy.ships, shipData]);

  const selectedShip = activeStrategy.ships.find((ship) => ship.id === selectedShipId) ?? null;
  const selectedMarker = activeStrategy.markers.find((marker) => marker.id === selectedMarkerId) ?? null;
  const selectedVector = activeStrategy.vectors.find((vector) => vector.id === selectedVectorId) ?? null;

  const addFormation = useCallback((item: FleetItem, quantity = formationQuantity, group = formationName) => {
    const uuid = getShipUuid(item);
    if (!uuid) return;
    const ship = shipData.get(uuid);
    const baseOffset = activeStrategy.ships.length ? Math.max(...activeStrategy.ships.map((node) => node.gridX)) + formationSpacing * 1.8 : 0;
    const nextShips = Array.from({ length: quantity }, (_, index) => {
      const pos = formationPosition(index, quantity, formationSpacing, formationType, baseOffset);
      const id = nextShipIdRef.current++;
      return {
        id,
        fleetItemId: item.id,
        shipUuid: uuid,
        label: quantity > 1 ? `${ship?.name ?? item.itemClassName} ${index + 1}` : ship?.name ?? item.itemClassName,
        owner: item.addedBy?.username ?? null,
        group,
        gridX: pos.gridX,
        gridZ: pos.gridZ,
      } satisfies TacticalShip;
    });
    updateActiveStrategy((strategy) => ({ ...strategy, ships: [...strategy.ships, ...nextShips] }));
  }, [activeStrategy.ships, formationName, formationQuantity, formationSpacing, formationType, shipData, updateActiveStrategy]);

  const addSelectedFormation = () => {
    const item = fleetItems.find((fleetItem) => fleetItem.id === formationShipId);
    if (item) addFormation(item);
  };

  const addMarker = (type: MarkerType) => {
    const labels: Record<MarkerType, string> = {
      objective: 'Objective',
      poi: 'Point of interest',
      obstacle: 'Obstacle',
    };
    const offset = activeStrategy.markers.length * 18;
    const marker: TacticalMarker = {
      id: makeId(),
      type,
      label: labels[type],
      gridX: offset,
      gridZ: 42,
      rotation: 0,
    };
    updateActiveStrategy((strategy) => ({ ...strategy, markers: [...strategy.markers, marker] }));
    setSelectedMarkerId(marker.id);
    setSelectedShipId(null);
    setSelectedVectorId(null);
  };

  const updateShipPosition = (id: number, position: { gridX: number; gridZ: number }) => {
    updateActiveStrategy((strategy) => ({
      ...strategy,
      ships: strategy.ships.map((ship) => (ship.id === id ? { ...ship, ...position } : ship)),
    }));
  };

  const updateMarkerPosition = (id: string, position: { gridX: number; gridZ: number }) => {
    updateActiveStrategy((strategy) => ({
      ...strategy,
      markers: strategy.markers.map((marker) => (marker.id === id ? { ...marker, ...position } : marker)),
    }));
  };

  const createVector = (vector: Omit<TacticalVector, 'id'>) => {
    const sourceShip = activeStrategy.ships.find((ship) => ship.id === vector.sourceId);
    const groupSize = sourceShip ? activeStrategy.ships.filter((ship) => ship.group === sourceShip.group).length : 0;
    const source = sourceShip && groupSize > 1
      ? { sourceType: 'group' as const, sourceId: sourceShip.group }
      : { sourceType: vector.sourceType, sourceId: vector.sourceId };
    const nextVector = { ...vector, ...source, id: makeId() };
    updateActiveStrategy((strategy) => ({ ...strategy, vectors: [...strategy.vectors, nextVector] }));
    setSelectedVectorId(nextVector.id);
    setSelectedMarkerId(null);
  };

  const updateVector = (id: string, vector: Pick<TacticalVector, 'endX' | 'endZ' | 'controlX' | 'controlZ'>) => {
    updateActiveStrategy((strategy) => ({
      ...strategy,
      vectors: strategy.vectors.map((item) => (item.id === id ? { ...item, ...vector } : item)),
    }));
  };

  const updateSelectedLabel = (label: string) => {
    if (selectedShip) {
      updateActiveStrategy((strategy) => ({
        ...strategy,
        ships: strategy.ships.map((ship) => (ship.id === selectedShip.id ? { ...ship, label } : ship)),
      }));
    }
    if (selectedMarker) {
      updateActiveStrategy((strategy) => ({
        ...strategy,
        markers: strategy.markers.map((marker) => (marker.id === selectedMarker.id ? { ...marker, label } : marker)),
      }));
    }
  };

  const removeSelection = () => {
    if (selectedShip) {
      updateActiveStrategy((strategy) => ({ ...strategy, ships: strategy.ships.filter((ship) => ship.id !== selectedShip.id) }));
      setSelectedShipId(null);
    }
    if (selectedMarker) {
      updateActiveStrategy((strategy) => ({ ...strategy, markers: strategy.markers.filter((marker) => marker.id !== selectedMarker.id) }));
      setSelectedMarkerId(null);
    }
    if (selectedVector) {
      updateActiveStrategy((strategy) => ({ ...strategy, vectors: strategy.vectors.filter((vector) => vector.id !== selectedVector.id) }));
      setSelectedVectorId(null);
    }
  };

  const createStrategy = () => {
    const strategy = defaultStrategy();
    setStrategies((prev) => [...prev, strategy]);
    setActiveStrategyId(strategy.id);
    setSelectedShipId(null);
    setSelectedMarkerId(null);
  };

  const duplicateStrategy = () => {
    const strategy = {
      ...activeStrategy,
      id: makeId(),
      name: `${activeStrategy.name} copy`,
      ships: activeStrategy.ships.map((ship) => ({ ...ship, id: nextShipIdRef.current++ })),
      markers: activeStrategy.markers.map((marker) => ({ ...marker, id: makeId() })),
      vectors: activeStrategy.vectors.map((vector) => ({ ...vector, id: makeId() })),
      updatedAt: nowIso(),
    };
    setStrategies((prev) => [...prev, strategy]);
    setActiveStrategyId(strategy.id);
  };

  const deleteStrategy = () => {
    if (strategies.length <= 1) {
      updateActiveStrategy((strategy) => ({ ...strategy, ships: [], markers: [], vectors: [] }));
      return;
    }
    const next = strategies.filter((strategy) => strategy.id !== activeStrategy.id);
    setStrategies(next);
    setActiveStrategyId(next[0].id);
  };

  if (!user) return <div className="p-8 text-center text-slate-500 font-mono-sc text-sm">Sign in to access corporation tactics.</div>;
  if (!loading && !corp) {
    return (
      <div className="flex min-h-[32rem] items-center justify-center p-8 text-center">
        <div className="max-w-md rounded-sm border border-cyan-900/40 bg-panel/80 p-6">
          <Radar size={34} className="mx-auto mb-4 text-cyan-500" />
          <h1 className="font-orbitron text-sm font-bold uppercase tracking-widest text-white">Corporation tactics required</h1>
          <p className="mt-3 text-sm text-slate-500">
            Tactics strategies belong to a corporation. Join or declare a corporation before creating tactical plans.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="-m-3 flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden sm:-m-6">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Radar size={16} className="shrink-0 text-cyan-400" />
          <div className="min-w-0">
            <h1 className="truncate font-orbitron text-sm font-bold uppercase tracking-wider text-white">Tactics</h1>
            <p className="truncate font-mono-sc text-[10px] text-slate-600">
              {corp ? `[${corp.tag}] ${corp.name}` : 'Corporation tactical board'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activeStrategy.id}
            onChange={(event) => {
              setActiveStrategyId(event.target.value);
              setSelectedShipId(null);
              setSelectedMarkerId(null);
            }}
            className="sci-input h-8 w-44 py-1 text-xs"
          >
            {strategies.map((strategy) => (
              <option key={strategy.id} value={strategy.id}>{strategy.name}</option>
            ))}
          </select>
          <button type="button" onClick={createStrategy} className="sci-btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs">
            <Plus size={12} /> Strategy
          </button>
          <button type="button" onClick={duplicateStrategy} className="flex items-center gap-1.5 rounded-sm border border-slate-800 px-3 py-1.5 font-mono-sc text-xs text-slate-400 hover:border-cyan-800/70 hover:text-cyan-300">
            <Copy size={12} /> Copy
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[19rem_minmax(0,1fr)_17rem]">
        <aside className="min-h-0 overflow-y-auto border-b border-border/50 bg-panel/80 lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b border-border/50 p-3">
            <div className="flex items-center gap-2">
              <Layers3 size={13} className="text-cyan-500" />
              <span className="font-orbitron text-[10px] font-bold uppercase tracking-widest text-slate-400">3D Fleet Builder</span>
            </div>
            <input
              value={activeStrategy.name}
              onChange={(event) => updateActiveStrategy((strategy) => ({ ...strategy, name: event.target.value }))}
              className="sci-input w-full"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={formationName}
                onChange={(event) => setFormationName(event.target.value)}
                className="sci-input col-span-2 w-full"
                placeholder="Group name"
              />
              <select
                aria-label="Formation ship"
                value={formationShipId ?? ''}
                onChange={(event) => setFormationShipId(event.target.value ? Number(event.target.value) : null)}
                disabled={fleetItems.length === 0}
                className="sci-input col-span-2 w-full disabled:opacity-60"
              >
                {fleetItems.length === 0 ? (
                  <option value="">{loading ? 'Loading ships...' : 'No corporation ships available'}</option>
                ) : null}
                {fleetItems.map((item) => {
                  const uuid = getShipUuid(item);
                  const ship = uuid ? shipData.get(uuid) : null;
                  return <option key={item.id} value={item.id}>{ship?.name ?? item.itemClassName}</option>;
                })}
              </select>
              <label className="space-y-1">
                <span className="font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">Qty</span>
                <input type="number" min={1} max={24} value={formationQuantity} onChange={(event) => setFormationQuantity(Number(event.target.value))} className="sci-input w-full" />
              </label>
              <label className="space-y-1">
                <span className="font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">Gap</span>
                <input type="number" min={12} max={120} value={formationSpacing} onChange={(event) => setFormationSpacing(Number(event.target.value))} className="sci-input w-full" />
              </label>
              <select value={formationType} onChange={(event) => setFormationType(event.target.value as FormationType)} className="sci-input col-span-2 w-full">
                <option value="wedge">Wedge formation</option>
                <option value="line">Line formation</option>
                <option value="box">Box formation</option>
              </select>
              <button type="button" onClick={addSelectedFormation} disabled={!formationShipId || fleetItems.length === 0} className="sci-btn-primary col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 text-xs disabled:opacity-40">
                <Ship size={12} /> {fleetItems.length === 0 ? 'No corporation ships' : 'Add formation'}
              </button>
            </div>
          </div>

          <div className="space-y-3 border-b border-border/50 p-3">
            <div className="flex items-center gap-2">
              <Flag size={13} className="text-cyan-500" />
              <span className="font-orbitron text-[10px] font-bold uppercase tracking-widest text-slate-400">Tactical Objects</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => addMarker('objective')} className="sci-btn-primary flex items-center justify-center gap-1.5 px-2 py-2 text-xs">
                <Flag size={12} /> Objective
              </button>
              <button type="button" onClick={() => addMarker('poi')} className="rounded-sm border border-slate-800 px-2 py-2 font-mono-sc text-xs text-slate-400 hover:border-cyan-800/70 hover:text-cyan-300">
                <Crosshair size={12} className="mr-1 inline" /> POI
              </button>
              <button type="button" onClick={() => addMarker('obstacle')} className="rounded-sm border border-slate-800 px-2 py-2 font-mono-sc text-xs text-slate-400 hover:border-red-800/70 hover:text-red-300">
                <Square size={12} className="mr-1 inline" /> Obstacle
              </button>
            </div>
          </div>

          <div className="p-3">
            <input value={shipQuery} onChange={(event) => setShipQuery(event.target.value)} placeholder="Filter fleet..." className="sci-input mb-2 w-full" />
            {loading ? (
              <div className="flex items-center justify-center py-8 text-slate-600"><Loader2 size={18} className="animate-spin" /></div>
            ) : filteredFleet.length === 0 ? (
              <p className="px-2 py-6 text-center font-mono-sc text-xs text-slate-700">
                {fleetItems.length === 0 ? 'No corporation ships available.' : 'No ship matches this filter.'}
              </p>
            ) : filteredFleet.slice(0, 30).map((item) => {
              const uuid = getShipUuid(item);
              const ship = uuid ? shipData.get(uuid) : null;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addFormation(item, 1, formationName)}
                  className="mb-1.5 flex w-full items-center gap-2 rounded-sm border border-slate-800/60 bg-slate-950/35 px-2 py-2 text-left transition-colors hover:border-cyan-800/70 hover:bg-cyan-950/20"
                >
                  {ship?.thumbnail ? <img src={ship.thumbnail} alt={ship.name} className="h-7 w-11 shrink-0 object-contain opacity-80" /> : <Ship size={15} className="text-slate-600" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-rajdhani text-sm font-semibold text-slate-200">{ship?.name ?? item.itemClassName}</span>
                    <span className="block truncate font-mono-sc text-[9px] text-slate-600">{ship?.role ?? item.addedBy?.username ?? 'Fleet item'}</span>
                  </span>
                  <Plus size={12} className="shrink-0 text-cyan-600" />
                </button>
              );
            })}
          </div>
        </aside>

        <main data-testid="tactics-board" className="relative min-h-[30rem] overflow-hidden bg-[#06101a]">
          {tacticShips.length === 0 && activeStrategy.markers.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <Radar size={42} className="text-slate-800" />
              <p className="max-w-md px-4 font-mono-sc text-sm text-slate-600">
                Add a fleet formation or a tactical object to start building a 3D plan.
              </p>
            </div>
          ) : (
            <FleetHoloViewer
              ships={tacticShips}
              selectedId={selectedShipId}
              onSelect={(id) => { setSelectedShipId(id); setSelectedMarkerId(null); setSelectedVectorId(null); }}
              onPositionChange={updateShipPosition}
              tacticalMarkers={activeStrategy.markers}
              selectedMarkerId={selectedMarkerId}
              onMarkerSelect={(id) => { setSelectedMarkerId(id); setSelectedShipId(null); setSelectedVectorId(null); }}
              onMarkerPositionChange={updateMarkerPosition}
              tacticalVectors={activeStrategy.vectors}
              selectedVectorId={selectedVectorId}
              onVectorSelect={(id) => { setSelectedVectorId(id); setSelectedShipId(null); setSelectedMarkerId(null); }}
              onVectorCreate={createVector}
              onVectorChange={updateVector}
            />
          )}
          <div className="pointer-events-none absolute left-3 top-3 rounded-sm border border-cyan-900/40 bg-slate-950/70 px-3 py-2 font-mono-sc text-[10px] text-cyan-500">
            <span className="mr-3"><Ship size={10} className="mr-1 inline" />{activeStrategy.ships.length} ships</span>
            <span><Flag size={10} className="mr-1 inline" />{activeStrategy.markers.length} objects</span>
            <span className="ml-3">{activeStrategy.vectors.length} vectors</span>
          </div>
        </main>

        <aside className="min-h-0 overflow-y-auto border-t border-border/50 bg-panel/85 p-3 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <span className="font-orbitron text-[10px] font-bold uppercase tracking-widest text-slate-400">Control</span>
            {(selectedShip || selectedMarker || selectedVector) && (
              <button type="button" onClick={() => { setSelectedShipId(null); setSelectedMarkerId(null); setSelectedVectorId(null); }} className="text-slate-600 hover:text-slate-300">
                <X size={14} />
              </button>
            )}
          </div>

          {!selectedShip && !selectedMarker && !selectedVector ? (
            <div className="space-y-3 py-6">
              <div className="rounded-sm border border-cyan-900/40 bg-cyan-950/10 p-3">
                <p className="flex items-center gap-1.5 font-mono-sc text-[10px] uppercase tracking-widest text-cyan-500">
                  <Save size={11} /> Auto-saved strategy
                </p>
                <p className="mt-1 text-xs text-slate-500">Drag ships and tactical objects directly in the 3D scene.</p>
              </div>
              <button type="button" onClick={deleteStrategy} className="flex w-full items-center justify-center gap-2 rounded-sm border border-red-900/60 bg-red-950/20 px-3 py-2 font-mono-sc text-xs text-red-400 hover:border-red-700/70">
                <Trash2 size={13} /> {strategies.length > 1 ? 'Delete strategy' : 'Clear strategy'}
              </button>
            </div>
          ) : (
            <div className="space-y-3 pt-3">
              <div className="rounded-sm border border-slate-800 bg-slate-950/40 p-3">
                <p className="flex items-center gap-1.5 font-mono-sc text-[10px] uppercase tracking-widest text-cyan-500">
                  {selectedShip ? <Ship size={11} /> : <Shield size={11} />}
                  {selectedShip ? 'Ship element' : selectedMarker ? selectedMarker.type : 'Movement vector'}
                </p>
              </div>
              {(selectedShip || selectedMarker) && (
                <label className="block">
                  <span className="font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">Label</span>
                  <input value={selectedShip?.label ?? selectedMarker?.label ?? ''} onChange={(event) => updateSelectedLabel(event.target.value)} className="sci-input mt-1 w-full" />
                </label>
              )}
              {selectedShip && (
                <label className="block">
                  <span className="font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">Group</span>
                  <input
                    value={selectedShip.group}
                    onChange={(event) => updateActiveStrategy((strategy) => ({
                      ...strategy,
                      ships: strategy.ships.map((ship) => (ship.id === selectedShip.id ? { ...ship, group: event.target.value } : ship)),
                    }))}
                    className="sci-input mt-1 w-full"
                  />
                </label>
              )}
              {selectedVector && <p className="text-xs text-slate-500">Drag the arrow tip to set the destination. Drag the center handle to curve the vector.</p>}
              <div className="grid grid-cols-2 gap-2 font-mono-sc text-[10px] text-slate-600">
                <span>X {(selectedShip?.gridX ?? selectedMarker?.gridX ?? selectedVector?.endX ?? 0).toFixed(1)}</span>
                <span>Z {(selectedShip?.gridZ ?? selectedMarker?.gridZ ?? selectedVector?.endZ ?? 0).toFixed(1)}</span>
              </div>
              <button type="button" onClick={removeSelection} className="flex w-full items-center justify-center gap-2 rounded-sm border border-red-900/60 bg-red-950/20 px-3 py-2 font-mono-sc text-xs text-red-400 hover:border-red-700/70">
                <Trash2 size={13} /> Remove selected
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
