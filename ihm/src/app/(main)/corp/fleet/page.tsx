'use client';

export const dynamic = 'force-dynamic';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  ChevronDown,
  ExternalLink,
  Loader2,
  Package,
  Plus,
  Search,
  Ship,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';
import createDynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { FleetShip } from '@/components/ship/FleetHoloViewer';
import { api } from '@/services/api';

const FleetHoloViewer = createDynamic(
  () => import('@/components/ship/FleetHoloViewer').then((m) => m.FleetHoloViewer),
  { ssr: false },
);
import type { ShipListItem } from '@/types/api';

interface FleetItem {
  id: number;
  shipUuid: string | null;
  itemClassName: string;
  notes: string | null;
  addedAt: string;
  addedBy: { id: number; username: string } | null;
}

interface Corp {
  id: number;
  name: string;
  tag: string;
  rsiArchetype: string | null;
  logoUrl: string | null;
}

// ── Ship search modal ─────────────────────────────────────────────────────────

function AddShipModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (ship: ShipListItem) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ShipListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await api.ships.search(q, 10);
      setResults(res ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 350);
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15 }}
        className="relative w-full max-w-lg sci-panel border border-border/80 shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50">
          <span className="text-xs font-orbitron font-bold text-slate-300 tracking-widest uppercase">Declare Ship</span>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-300 transition-colors"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              autoFocus
              value={query}
              onChange={handleChange}
              placeholder="Search by ship name or class…"
              className="sci-input w-full pl-9"
            />
            {loading && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 animate-spin" />}
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-border/30">
            {results.length === 0 && query && !loading && (
              <p className="py-6 text-center text-slate-600 text-xs font-mono-sc">No ship found</p>
            )}
            {results.length === 0 && !query && (
              <p className="py-6 text-center text-slate-600 text-xs font-mono-sc">Type a ship name to search…</p>
            )}
            {results.map((ship) => (
              <button
                key={ship.uuid}
                type="button"
                onClick={() => onAdd(ship)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left group"
              >
                {ship.thumbnail ? (
                  <img src={ship.thumbnail} alt={ship.name} className="w-10 h-6 object-contain shrink-0 opacity-80 group-hover:opacity-100" />
                ) : (
                  <div className="w-10 h-6 flex items-center justify-center shrink-0">
                    <Ship size={16} className="text-slate-700" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-sm font-rajdhani font-semibold text-slate-200 truncate">{ship.name}</p>
                    {ship.is_concept_only && (
                      <span className="text-[8px] font-orbitron font-bold text-amber-500 border border-amber-700/40 bg-amber-950/30 px-1 py-0.5 rounded-sm shrink-0">CONCEPT</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-600 font-mono-sc">{ship.manufacturer_name} · {ship.role}</p>
                </div>
                <ArrowRight size={13} className="text-slate-700 group-hover:text-cyan-400 transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Selected ship info panel ──────────────────────────────────────────────────

function ShipInfoPanel({ ship, item, onRemove, canRemove }: {
  ship: ShipListItem;
  item: FleetItem;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Identity */}
      <div>
        {ship.thumbnail_large && (
          <img src={ship.thumbnail_large} alt={ship.name} className="w-full h-24 object-contain opacity-80 mb-3" />
        )}
        <h3 className="text-base font-orbitron font-bold text-white tracking-wider leading-tight">{ship.name}</h3>
        {ship.manufacturer_name && (
          <p className="text-xs text-slate-500 font-mono-sc mt-0.5">{ship.manufacturer_name}</p>
        )}
        {ship.role && (
          <span className="inline-block mt-1 text-[9px] font-orbitron font-bold text-cyan-600 border border-cyan-800/40 bg-cyan-950/30 px-1.5 py-0.5 rounded-sm">
            {ship.role.toUpperCase()}
          </span>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {ship.crew_size != null && (
          <div className="sci-panel px-2.5 py-2 border border-slate-800/50">
            <p className="text-[9px] text-slate-600 font-mono-sc uppercase tracking-wider flex items-center gap-1"><Users size={9} /> Crew</p>
            <p className="text-sm font-orbitron font-bold text-slate-200">{ship.crew_size}</p>
          </div>
        )}
        {ship.scm_speed != null && (
          <div className="sci-panel px-2.5 py-2 border border-slate-800/50">
            <p className="text-[9px] text-slate-600 font-mono-sc uppercase tracking-wider flex items-center gap-1"><Zap size={9} /> SCM</p>
            <p className="text-sm font-orbitron font-bold text-slate-200">{ship.scm_speed} m/s</p>
          </div>
        )}
        {ship.cargo_capacity != null && (
          <div className="sci-panel px-2.5 py-2 border border-slate-800/50">
            <p className="text-[9px] text-slate-600 font-mono-sc uppercase tracking-wider flex items-center gap-1"><Package size={9} /> Cargo</p>
            <p className="text-sm font-orbitron font-bold text-slate-200">{ship.cargo_capacity} SCU</p>
          </div>
        )}
        {ship.total_hp != null && (
          <div className="sci-panel px-2.5 py-2 border border-slate-800/50">
            <p className="text-[9px] text-slate-600 font-mono-sc uppercase tracking-wider">Hull HP</p>
            <p className="text-sm font-orbitron font-bold text-slate-200">{ship.total_hp.toLocaleString()}</p>
          </div>
        )}
      </div>

      {/* Declared by */}
      {item.addedBy && (
        <p className="text-[11px] text-slate-600 font-mono-sc">
          Declared by <span className="text-slate-400">{item.addedBy.username}</span>
        </p>
      )}

      {/* Actions */}
      <div className="space-y-2 pt-1">
        <Link
          href={`/ships/${ship.uuid}`}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-cyan-900/40 border border-cyan-700/50 hover:border-cyan-500/70 hover:bg-cyan-900/60 text-cyan-300 font-mono-sc text-xs rounded transition-colors"
        >
          <ExternalLink size={13} /> View Ship Details
        </Link>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-red-800/50 hover:border-red-600/70 bg-red-950/20 hover:bg-red-950/40 text-red-500 hover:text-red-400 font-mono-sc text-xs rounded transition-colors"
          >
            <Trash2 size={13} /> Remove from Fleet
          </button>
        )}
      </div>
    </div>
  );
}

// ── View mode selector ────────────────────────────────────────────────────────

type ViewMode = 'mine' | 'member' | 'all';

interface Member { id: number; username: string; avatarUrl: string | null }

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FleetManagerPage() {
  const { user } = useAuth();
  const [corp, setCorp] = useState<Corp | null>(null);
  const [fleetItems, setFleetItems] = useState<FleetItem[]>([]);
  const [shipData, setShipData] = useState<Map<string, ShipListItem>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('mine');
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);

  const loadFleet = useCallback(async () => {
    setLoading(true);
    try {
      const [fleetRes, membersRes] = await Promise.all([
        fetch('/api/corp/fleet'),
        fetch('/api/corp/members'),
      ]);
      const fleetData = await fleetRes.json();
      if (!fleetRes.ok) { setLoading(false); return; }
      setCorp(fleetData.corporation ?? null);
      const items: FleetItem[] = fleetData.data ?? [];
      setFleetItems(items);

      if (membersRes.ok) {
        const membersData = await membersRes.json();
        const memberList: Member[] = (membersData.data ?? []).map((m: any) => ({
          id: m.user.id,
          username: m.user.username,
          avatarUrl: m.user.avatarUrl,
        }));
        setMembers(memberList);
      }

      // Enrich with ship data
      const uuids = [...new Set(items.map((i: FleetItem) => i.shipUuid).filter(Boolean))] as string[];
      const shipMap = new Map<string, ShipListItem>();
      await Promise.all(
        uuids.map(async (uuid) => {
          try {
            const r = await api.ships.get(uuid);
            if (r) shipMap.set(uuid, r as unknown as ShipListItem);
          } catch {}
        })
      );
      setShipData(shipMap);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) loadFleet(); }, [user, loadFleet]);

  // Close member dropdown on outside click
  useEffect(() => {
    if (!memberDropdownOpen) return;
    const handler = () => setMemberDropdownOpen(false);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [memberDropdownOpen]);

  const handleAddShip = async (ship: ShipListItem) => {
    setAddLoading(true);
    try {
      const res = await fetch('/api/corp/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipUuid: ship.uuid, itemClassName: ship.class_name }),
      });
      if (res.ok) { await loadFleet(); setShowAddModal(false); }
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemove = async (itemId: number) => {
    try {
      await fetch(`/api/corp/fleet/${itemId}`, { method: 'DELETE' });
      setFleetItems((prev) => prev.filter((i) => i.id !== itemId));
      if (selectedItemId === itemId) setSelectedItemId(null);
    } catch {}
  };

  // Filter items by view mode
  const visibleItems = fleetItems.filter((i) => {
    if (viewMode === 'mine')   return i.addedBy?.id === user?.id;
    if (viewMode === 'member') return i.addedBy?.id === selectedMemberId;
    return true; // 'all'
  });
  const visibleItemIds = visibleItems.map((i) => i.id).join(',');

  // Memoize fleetShips — prevents scene rebuild on selection change
  const fleetShips: FleetShip[] = useMemo(() => visibleItems
    .filter((i) => i.shipUuid && shipData.has(i.shipUuid))
    .map((i) => {
      const s = shipData.get(i.shipUuid!)!;
      return {
        id: i.id, shipUuid: i.shipUuid!, name: s.name, className: s.class_name,
        manufacturerCode: s.manufacturer_code, role: s.role, career: s.career,
        crewSize: s.crew_size, scmSpeed: s.scm_speed,
        isConceptOnly: (s as any).is_concept_only ?? false,
        thumbnailUrl: (s as any).thumbnail_large ?? (s as any).thumbnail ?? null,
        ctmUrl: (s as any).is_concept_only ? null : `/api/v1/ships/${i.shipUuid}/model/file`,
        declaredBy: i.addedBy?.username ?? null,
      } satisfies FleetShip;
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [visibleItemIds, shipData.size]);

  const selectedItem = visibleItems.find((i) => i.id === selectedItemId) ?? null;
  const selectedShip = selectedItem?.shipUuid ? shipData.get(selectedItem.shipUuid) ?? null : null;
  const selectedMember = members.find((m) => m.id === selectedMemberId);

  if (!user) return (
    <div className="p-8 text-center text-slate-500 font-mono-sc text-sm">Sign in to access the fleet manager.</div>
  );

  if (!loading && !corp) return (
    <div className="p-8 text-center space-y-3">
      <Building2 size={32} className="text-slate-700 mx-auto" />
      <p className="text-slate-500 font-mono-sc text-sm">You are not part of any corporation.</p>
      <Link href="/profile" className="text-cyan-500 hover:text-cyan-300 text-xs font-mono-sc transition-colors">
        Join a corporation →
      </Link>
    </div>
  );

  return (
    <>
      <div className="flex flex-col h-[calc(100dvh-3.5rem)] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-border/50 shrink-0 flex-wrap gap-y-2">
          <div className="flex items-center gap-3 min-w-0">
            <Ship size={16} className="text-cyan-400 shrink-0" />
            <h1 className="text-sm font-orbitron font-bold text-white tracking-wider uppercase truncate">
              Fleet Manager
            </h1>
            {corp && (
              <span className="text-[10px] font-orbitron text-slate-500 border border-slate-800 px-1.5 py-0.5 rounded-sm shrink-0">
                [{corp.tag}] {corp.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {/* View mode selector */}
            <div className="flex gap-1 rounded-sm border border-slate-800 p-0.5 bg-slate-900/60">
              {/* My Fleet */}
              <button
                type="button"
                onClick={() => { setViewMode('mine'); setSelectedItemId(null); }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-sm text-[10px] font-orbitron font-bold uppercase tracking-wider transition-all ${
                  viewMode === 'mine' ? 'bg-cyan-950/80 text-cyan-400 border border-cyan-800/60' : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                <Ship size={10} /> My Fleet
              </button>

              {/* Member picker */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setViewMode('member'); setMemberDropdownOpen((v) => !v); setSelectedItemId(null); }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-sm text-[10px] font-orbitron font-bold uppercase tracking-wider transition-all ${
                    viewMode === 'member' ? 'bg-cyan-950/80 text-cyan-400 border border-cyan-800/60' : 'text-slate-600 hover:text-slate-400'
                  }`}
                >
                  <Users size={10} />
                  {viewMode === 'member' && selectedMember ? selectedMember.username : 'Member'}
                  <ChevronDown size={9} />
                </button>
                {memberDropdownOpen && (
                  <div
                    className="absolute top-full mt-1 right-0 z-50 w-44 bg-slate-900 border border-slate-700 rounded-sm shadow-xl"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {members.length === 0 ? (
                      <p className="px-3 py-2 text-[10px] text-slate-600 font-mono-sc">No members</p>
                    ) : members.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { setSelectedMemberId(m.id); setMemberDropdownOpen(false); setViewMode('member'); setSelectedItemId(null); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors ${
                          m.id === selectedMemberId ? 'text-cyan-400' : 'text-slate-300'
                        }`}
                      >
                        <Users size={10} className="text-slate-600 shrink-0" />
                        <span className="text-xs font-rajdhani font-semibold truncate">{m.username}</span>
                        <span className="text-[9px] text-slate-600 font-mono-sc ml-auto shrink-0">
                          {fleetItems.filter((i) => i.addedBy?.id === m.id).length}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* All Corp */}
              <button
                type="button"
                onClick={() => { setViewMode('all'); setSelectedItemId(null); }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-sm text-[10px] font-orbitron font-bold uppercase tracking-wider transition-all ${
                  viewMode === 'all' ? 'bg-cyan-950/80 text-cyan-400 border border-cyan-800/60' : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                <Building2 size={10} /> Corp
              </button>
            </div>

            <span className="text-[10px] text-slate-600 font-mono-sc">
              {visibleItems.length}/{fleetItems.length}
            </span>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              disabled={!corp || addLoading}
              className="sci-btn-primary py-1.5 px-3 text-xs gap-1.5 flex items-center disabled:opacity-40"
            >
              <Plus size={12} /> Declare ship
            </button>
          </div>
        </div>

        {/* Main layout: viewer + info panel */}
        <div className="flex flex-1 overflow-hidden">

          {/* 3D Viewer */}
          <div className="flex-1 relative bg-[#06101a]">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 size={24} className="text-cyan-700 animate-spin" />
              </div>
            ) : fleetShips.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Ship size={40} className="text-slate-800" />
                <p className="text-slate-600 font-mono-sc text-sm text-center px-4">
                  {viewMode === 'mine' ? <>No ships declared yet.<br />Click "Declare ship" to add yours.</>
                   : viewMode === 'member' && selectedMember ? `${selectedMember.username} has no ships declared.`
                   : viewMode === 'member' ? 'Select a member to view their fleet.'
                   : 'No ships declared in this corporation yet.'}
                </p>
              </div>
            ) : (
              <FleetHoloViewer
                ships={fleetShips}
                selectedId={selectedItemId}
                onSelect={setSelectedItemId}
              />
            )}

            {/* Ship list overlay — bottom strip */}
            {!loading && visibleItems.length > 0 && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950/95 to-transparent pt-6 pb-2 px-3">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {visibleItems.map((item) => {
                    const s = item.shipUuid ? shipData.get(item.shipUuid) : null;
                    const isSelected = item.id === selectedItemId;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedItemId(isSelected ? null : item.id)}
                        className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-sm border transition-all ${
                          isSelected
                            ? 'border-cyan-600 bg-cyan-950/60 text-cyan-300'
                            : 'border-slate-800/60 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <Ship size={11} className={isSelected ? 'text-cyan-400' : 'text-slate-600'} />
                        <span className="text-[11px] font-rajdhani font-semibold truncate max-w-[120px]">
                          {s?.name ?? item.itemClassName}
                        </span>
                        {item.addedBy && (
                          <span className="text-[9px] text-slate-600 font-mono-sc">by {item.addedBy.username}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Hint bottom-right */}
            {!loading && fleetShips.length > 0 && (
              <div className="absolute bottom-12 right-3 text-[9px] text-slate-700 font-mono-sc">
                Drag: rotate · Scroll: zoom · Click ship: select
              </div>
            )}
          </div>

          {/* Info panel */}
          <AnimatePresence>
            {selectedItem && selectedShip && (
              <motion.aside
                key="info"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 260, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="shrink-0 border-l border-border/50 bg-panel/95 overflow-y-auto"
              >
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[9px] font-orbitron text-slate-600 uppercase tracking-widest">Selected</span>
                    <button onClick={() => setSelectedItemId(null)} className="text-slate-700 hover:text-slate-300 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                  <ShipInfoPanel
                    ship={selectedShip}
                    item={selectedItem}
                    onRemove={() => handleRemove(selectedItem.id)}
                    canRemove={selectedItem.addedBy?.id === user?.id}
                  />
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Add ship modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddShipModal onClose={() => setShowAddModal(false)} onAdd={handleAddShip} />
        )}
      </AnimatePresence>
    </>
  );
}
