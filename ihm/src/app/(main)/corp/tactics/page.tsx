'use client';

export const dynamic = 'force-dynamic';

import { Crosshair, Flag, Loader2, MoveRight, Plus, Radar, RotateCcw, Save, Ship, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import type { ShipListItem } from '@/types/api';

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

type TacticNodeType = 'ship' | 'objective' | 'poi' | 'vector';

interface TacticNode {
  id: string;
  type: TacticNodeType;
  label: string;
  x: number;
  y: number;
  rotation: number;
  shipUuid?: string | null;
  fleetItemId?: number;
  owner?: string | null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const makeId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const getShipUuid = (item: FleetItem) => item.shipUuid?.trim() || null;

export default function CorporationTacticsPage() {
  const { user } = useAuth();
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [corp, setCorp] = useState<Corp | null>(null);
  const [fleetItems, setFleetItems] = useState<FleetItem[]>([]);
  const [shipData, setShipData] = useState<Map<string, ShipListItem>>(new Map());
  const [nodes, setNodes] = useState<TacticNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [shipQuery, setShipQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [storageKey, setStorageKey] = useState('starvis-tactics-personal');

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/corp/fleet');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const items: FleetItem[] = data.data ?? [];
        const nextCorp: Corp | null = data.corporation ?? null;
        setCorp(nextCorp);
        setFleetItems(items);
        const key = `starvis-tactics-${nextCorp?.id ?? `user-${userId}`}`;
        setStorageKey(key);
        const saved = localStorage.getItem(key);
        setNodes(saved ? JSON.parse(saved) : []);

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
    if (!user || !storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(nodes));
  }, [nodes, storageKey, user]);

  const filteredFleet = useMemo(() => {
    const q = shipQuery.trim().toLowerCase();
    if (!q) return fleetItems;
    return fleetItems.filter((item) => {
      const uuid = getShipUuid(item);
      const ship = uuid ? shipData.get(uuid) : null;
      return `${ship?.name ?? item.itemClassName} ${item.addedBy?.username ?? ''}`.toLowerCase().includes(q);
    });
  }, [fleetItems, shipData, shipQuery]);

  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null;

  const addShip = useCallback((item: FleetItem) => {
    const uuid = getShipUuid(item);
    const ship = uuid ? shipData.get(uuid) : null;
    setNodes((prev) => [
      ...prev,
      {
        id: makeId(),
        type: 'ship',
        label: ship?.name ?? item.itemClassName,
        shipUuid: uuid,
        fleetItemId: item.id,
        owner: item.addedBy?.username ?? null,
        x: 44 + (prev.length % 8) * 6,
        y: 42 + (prev.length % 5) * 5,
        rotation: 0,
      },
    ]);
  }, [shipData]);

  const addMarker = (type: Exclude<TacticNodeType, 'ship'>) => {
    const label = type === 'objective' ? 'Objective' : type === 'poi' ? 'Point of interest' : 'Movement vector';
    setNodes((prev) => [
      ...prev,
      {
        id: makeId(),
        type,
        label,
        x: 50,
        y: 50,
        rotation: type === 'vector' ? 0 : 0,
      },
    ]);
  };

  const updateNode = (id: string, patch: Partial<TacticNode>) => {
    setNodes((prev) => prev.map((node) => (node.id === id ? { ...node, ...patch } : node)));
  };

  const removeNode = (id: string) => {
    setNodes((prev) => prev.filter((node) => node.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  };

  const moveDraggedNode = useCallback((clientX: number, clientY: number) => {
    if (!dragId || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const x = clamp(((clientX - rect.left) / rect.width) * 100, 2, 98);
    const y = clamp(((clientY - rect.top) / rect.height) * 100, 4, 96);
    updateNode(dragId, { x, y });
  }, [dragId]);

  useEffect(() => {
    if (!dragId) return;
    const onMove = (event: PointerEvent) => moveDraggedNode(event.clientX, event.clientY);
    const onUp = () => setDragId(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragId, moveDraggedNode]);

  if (!user) return <div className="p-8 text-center text-slate-500 font-mono-sc text-sm">Sign in to access corporation tactics.</div>;

  return (
    <div className="-m-3 flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden sm:-m-6">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Radar size={16} className="shrink-0 text-cyan-400" />
          <div className="min-w-0">
            <h1 className="truncate font-orbitron text-sm font-bold uppercase tracking-wider text-white">Tactics</h1>
            <p className="truncate font-mono-sc text-[10px] text-slate-600">
              {corp ? `[${corp.tag}] ${corp.name}` : 'Personal tactical board'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-sm border border-cyan-900/50 bg-cyan-950/20 px-2 py-1 font-mono-sc text-[10px] text-cyan-500 sm:flex">
            <Save size={11} /> Auto-saved
          </span>
          <button type="button" onClick={() => addMarker('objective')} className="sci-btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs">
            <Flag size={12} /> Objective
          </button>
          <button type="button" onClick={() => addMarker('poi')} className="flex items-center gap-1.5 rounded-sm border border-slate-800 px-3 py-1.5 font-mono-sc text-xs text-slate-400 hover:border-cyan-800/70 hover:text-cyan-300">
            <Crosshair size={12} /> POI
          </button>
          <button type="button" onClick={() => addMarker('vector')} className="flex items-center gap-1.5 rounded-sm border border-slate-800 px-3 py-1.5 font-mono-sc text-xs text-slate-400 hover:border-cyan-800/70 hover:text-cyan-300">
            <MoveRight size={12} /> Vector
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)_16rem]">
        <aside className="min-h-0 border-b border-border/50 bg-panel/80 lg:border-b-0 lg:border-r">
          <div className="border-b border-border/50 p-3">
            <div className="flex items-center gap-2">
              <Ship size={13} className="text-cyan-500" />
              <span className="font-orbitron text-[10px] font-bold uppercase tracking-widest text-slate-400">Fleet Palette</span>
            </div>
            <input
              value={shipQuery}
              onChange={(event) => setShipQuery(event.target.value)}
              placeholder="Filter ships..."
              className="sci-input mt-3 w-full"
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-2 lg:max-h-none">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-slate-600"><Loader2 size={18} className="animate-spin" /></div>
            ) : filteredFleet.length === 0 ? (
              <p className="px-2 py-6 text-center font-mono-sc text-xs text-slate-700">No fleet ships available.</p>
            ) : filteredFleet.map((item) => {
              const uuid = getShipUuid(item);
              const ship = uuid ? shipData.get(uuid) : null;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addShip(item)}
                  className="mb-1.5 flex w-full items-center gap-2 rounded-sm border border-slate-800/60 bg-slate-950/35 px-2 py-2 text-left transition-colors hover:border-cyan-800/70 hover:bg-cyan-950/20"
                >
                  {ship?.thumbnail ? (
                    <img src={ship.thumbnail} alt={ship.name} className="h-7 w-11 shrink-0 object-contain opacity-80" />
                  ) : (
                    <span className="flex h-7 w-11 shrink-0 items-center justify-center border border-slate-800 bg-slate-950">
                      <Ship size={13} className="text-slate-600" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-rajdhani text-sm font-semibold text-slate-200">{ship?.name ?? item.itemClassName}</span>
                    <span className="block truncate font-mono-sc text-[9px] text-slate-600">{item.addedBy?.username ?? 'Unknown owner'}</span>
                  </span>
                  <Plus size={12} className="shrink-0 text-cyan-600" />
                </button>
              );
            })}
          </div>
        </aside>

        <main data-testid="tactics-board" className="relative min-h-[26rem] overflow-hidden bg-[#04101a]">
          <div
            ref={boardRef}
            className="absolute inset-0 cursor-crosshair overflow-hidden"
            style={{
              backgroundImage:
                'linear-gradient(rgba(34,211,238,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.14) 1px, transparent 1px), radial-gradient(circle at center, rgba(20,184,166,0.16), transparent 62%)',
              backgroundSize: '36px 36px, 36px 36px, 100% 100%',
            }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-cyan-700/25" />
            <div className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-cyan-700/25" />
            {nodes.map((node) => {
              const active = node.id === selectedId;
              const isVector = node.type === 'vector';
              return (
                <button
                  key={node.id}
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setSelectedId(node.id);
                    setDragId(node.id);
                  }}
                  className={[
                    'absolute -translate-x-1/2 -translate-y-1/2 touch-none select-none rounded-sm border px-2 py-1 text-left shadow-[0_0_24px_rgba(34,211,238,0.12)] transition-colors',
                    active ? 'border-cyan-300 bg-cyan-950/80 text-cyan-100' : 'border-cyan-800/60 bg-slate-950/70 text-cyan-300 hover:border-cyan-500/70',
                    isVector ? 'w-28' : 'max-w-[9rem]',
                  ].join(' ')}
                  style={{
                    left: `${node.x}%`,
                    top: `${node.y}%`,
                    transform: `translate(-50%, -50%) rotate(${node.rotation}deg)`,
                  }}
                >
                  <span className="flex items-center gap-1.5">
                    {node.type === 'ship' && <Ship size={12} className="shrink-0" />}
                    {node.type === 'objective' && <Flag size={12} className="shrink-0" />}
                    {node.type === 'poi' && <Crosshair size={12} className="shrink-0" />}
                    {node.type === 'vector' && <MoveRight size={18} className="shrink-0" />}
                    <span className="truncate font-rajdhani text-xs font-bold uppercase tracking-wider">{node.label}</span>
                  </span>
                  {node.owner && <span className="block truncate font-mono-sc text-[8px] text-slate-500">by {node.owner}</span>}
                </button>
              );
            })}
          </div>
        </main>

        <aside className="min-h-0 border-t border-border/50 bg-panel/85 p-3 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <span className="font-orbitron text-[10px] font-bold uppercase tracking-widest text-slate-400">Selection</span>
            {selectedNode && (
              <button type="button" onClick={() => setSelectedId(null)} className="text-slate-600 hover:text-slate-300">
                <X size={14} />
              </button>
            )}
          </div>
          {!selectedNode ? (
            <p className="py-8 text-center font-mono-sc text-xs text-slate-700">Select a tactical element.</p>
          ) : (
            <div className="space-y-3 pt-3">
              <label className="block">
                <span className="font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">Label</span>
                <input
                  value={selectedNode.label}
                  onChange={(event) => updateNode(selectedNode.id, { label: event.target.value })}
                  className="sci-input mt-1 w-full"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateNode(selectedNode.id, { rotation: selectedNode.rotation - 15 })}
                  className="flex items-center justify-center gap-1.5 rounded-sm border border-slate-800 px-2 py-2 font-mono-sc text-xs text-slate-400 hover:border-cyan-800/70 hover:text-cyan-300"
                >
                  <RotateCcw size={12} /> -15
                </button>
                <button
                  type="button"
                  onClick={() => updateNode(selectedNode.id, { rotation: selectedNode.rotation + 15 })}
                  className="flex items-center justify-center gap-1.5 rounded-sm border border-slate-800 px-2 py-2 font-mono-sc text-xs text-slate-400 hover:border-cyan-800/70 hover:text-cyan-300"
                >
                  <RotateCcw size={12} className="rotate-180" /> +15
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono-sc text-[10px] text-slate-600">
                <span>X {selectedNode.x.toFixed(1)}%</span>
                <span>Y {selectedNode.y.toFixed(1)}%</span>
              </div>
              <button
                type="button"
                onClick={() => removeNode(selectedNode.id)}
                className="flex w-full items-center justify-center gap-2 rounded-sm border border-red-900/60 bg-red-950/20 px-3 py-2 font-mono-sc text-xs text-red-400 hover:border-red-700/70"
              >
                <Trash2 size={13} /> Remove
              </button>
              <button
                type="button"
                onClick={() => { setNodes([]); setSelectedId(null); }}
                className="flex w-full items-center justify-center gap-2 rounded-sm border border-slate-800 px-3 py-2 font-mono-sc text-xs text-slate-500 hover:border-slate-700 hover:text-slate-300"
              >
                Clear board
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
