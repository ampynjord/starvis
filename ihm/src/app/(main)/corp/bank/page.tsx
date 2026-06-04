'use client';

export const dynamic = 'force-dynamic';

import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  Loader2,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { StatCard, StatGrid } from '@/components/ui/StatCard';
import { useAuth } from '@/contexts/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BankItem {
  id: number;
  itemType: string;
  itemClassName: string;
  quantity: number;
  notes: string | null;
  addedAt: string;
  addedBy: { id: number; username: string } | null;
}

interface Corp { id: number; name: string; tag: string }

const ITEM_TYPES = [
  { value: 'armor',      label: 'Armor',            color: 'text-blue-400',   bg: 'bg-blue-950/30 border-blue-800/40' },
  { value: 'clothing',   label: 'Clothing',          color: 'text-pink-400',   bg: 'bg-pink-950/30 border-pink-800/40' },
  { value: 'weapon',     label: 'Weapon',            color: 'text-red-400',    bg: 'bg-red-950/30 border-red-800/40' },
  { value: 'utility',    label: 'Utility',           color: 'text-green-400',  bg: 'bg-green-950/30 border-green-800/40' },
  { value: 'ammo',       label: 'Ammo',              color: 'text-amber-400',  bg: 'bg-amber-950/30 border-amber-800/40' },
  { value: 'vehicle',    label: 'Vehicle Equipment', color: 'text-cyan-400',   bg: 'bg-cyan-950/30 border-cyan-800/40' },
  { value: 'sustenance', label: 'Sustenance',        color: 'text-orange-400', bg: 'bg-orange-950/30 border-orange-800/40' },
  { value: 'container',  label: 'Container',         color: 'text-violet-400', bg: 'bg-violet-950/30 border-violet-800/40' },
  { value: 'other',      label: 'Other',             color: 'text-slate-400',  bg: 'bg-slate-800/30 border-slate-700/40' },
] as const;

type ItemTypeValue = (typeof ITEM_TYPES)[number]['value'];

// ── Add item modal ────────────────────────────────────────────────────────────

function AddItemModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (data: { itemType: ItemTypeValue; itemClassName: string; quantity: number; notes: string }) => void;
}) {
  const [itemType, setItemType] = useState<ItemTypeValue>('vehicle');
  const [className, setClassName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  // Search for components/items
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ class_name: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const endpointMap: Record<string, string> = {
        armor:      `/api/v1/items/category/armor?search=${encodeURIComponent(q)}&limit=8`,
        clothing:   `/api/v1/items/category/clothing?search=${encodeURIComponent(q)}&limit=8`,
        weapon:     `/api/v1/items/category/weapons?search=${encodeURIComponent(q)}&limit=8`,
        utility:    `/api/v1/items/category/utility?search=${encodeURIComponent(q)}&limit=8`,
        ammo:       `/api/v1/items/category/ammo?search=${encodeURIComponent(q)}&limit=8`,
        vehicle:    `/api/v1/components?search=${encodeURIComponent(q)}&limit=8`,
        sustenance: `/api/v1/items/category/sustenance?search=${encodeURIComponent(q)}&limit=8`,
        container:  `/api/v1/commodities?search=${encodeURIComponent(q)}&limit=8`,
      };
      const endpoint = endpointMap[itemType];
      if (endpoint) {
        const res = await fetch(endpoint);
        const data = await res.json();
        setSearchResults((data.data ?? []).map((c: any) => ({ class_name: c.class_name, name: c.display_name ?? c.name ?? c.class_name })));
      }
    } finally {
      setSearching(false);
    }
  }, [itemType]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 350);
  };

  const selectResult = (r: { class_name: string; name: string }) => {
    setClassName(r.class_name);
    setSearchQuery(r.name);
    setShowSearch(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!className.trim()) return;
    onAdd({ itemType, itemClassName: className.trim(), quantity, notes });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15 }}
        className="relative w-full max-w-md sci-panel border border-border/80 shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50">
          <span className="text-xs font-orbitron font-bold text-slate-300 tracking-widest uppercase">Declare Item</span>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-300 transition-colors"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {/* Type selector */}
          <div className="space-y-1">
            <label className="text-[10px] font-orbitron text-slate-500 uppercase tracking-widest">Category</label>
            <div className="flex gap-1.5">
              {ITEM_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => { setItemType(t.value); setClassName(''); setSearchQuery(''); setSearchResults([]); }}
                  className={`flex-1 py-1.5 rounded-sm border text-[10px] font-orbitron font-bold tracking-widest uppercase transition-all ${
                    itemType === t.value ? `${t.color} ${t.bg}` : 'border-slate-800 text-slate-600 hover:text-slate-400'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Item search */}
          <div className="space-y-1 relative">
            <label className="text-[10px] font-orbitron text-slate-500 uppercase tracking-widest">
              {itemType === 'other' ? 'Name / class' : 'Search'}
            </label>
            <div className="relative">
              <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => setShowSearch(true)}
                placeholder={itemType === 'other' ? 'Enter class name…' : `Search ${itemType}s…`}
                className="sci-input w-full pl-8 text-sm"
                autoComplete="off"
              />
              {searching && <Loader2 size={11} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 animate-spin" />}
            </div>
            {showSearch && searchResults.length > 0 && (
              <div className="absolute z-10 top-full mt-1 w-full bg-slate-900 border border-slate-700 rounded-sm shadow-xl max-h-40 overflow-y-auto">
                {searchResults.map((r) => (
                  <button
                    key={r.class_name}
                    type="button"
                    onMouseDown={() => selectResult(r)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                  >
                    <span className="text-sm font-rajdhani text-slate-200 flex-1 truncate">{r.name}</span>
                    <span className="text-[9px] text-slate-600 font-mono-sc truncate max-w-[100px]">{r.class_name}</span>
                  </button>
                ))}
              </div>
            )}
            {itemType === 'other' && (
              <p className="text-[10px] text-slate-600">Enter any class name manually.</p>
            )}
            {className && className !== searchQuery && (
              <p className="text-[10px] text-cyan-600 font-mono-sc">{className}</p>
            )}
          </div>

          {/* Quantity */}
          <div className="space-y-1">
            <label className="text-[10px] font-orbitron text-slate-500 uppercase tracking-widest">Quantity</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              className="sci-input w-full"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-[10px] font-orbitron text-slate-500 uppercase tracking-widest">Notes (optional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes…"
              className="sci-input w-full text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={!className.trim()}
            className="w-full py-2 px-4 bg-cyan-900/40 border border-cyan-700/50 hover:border-cyan-500/70 text-cyan-300 font-mono-sc text-xs rounded transition-colors disabled:opacity-40"
          >
            Add to Bank
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({ item, onRemove, canRemove }: { item: BankItem; onRemove: () => void; canRemove: boolean }) {
  const typeStyle = ITEM_TYPES.find((t) => t.value === item.itemType) ?? ITEM_TYPES[3];
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-rajdhani font-semibold text-slate-200 truncate">{item.itemClassName}</span>
          <span className={`text-[9px] font-orbitron font-bold px-1.5 py-0.5 rounded-sm border ${typeStyle.color} ${typeStyle.bg}`}>
            {typeStyle.label.toUpperCase()}
          </span>
          {item.quantity > 1 && (
            <span className="text-[10px] text-slate-500 font-mono-sc">×{item.quantity}</span>
          )}
        </div>
        {item.notes && <p className="text-[11px] text-slate-600 mt-0.5 truncate">{item.notes}</p>}
        {item.addedBy && (
          <p className="text-[10px] text-slate-700 mt-0.5 font-mono-sc">by {item.addedBy.username}</p>
        )}
      </div>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded border border-transparent hover:border-red-800/50 hover:bg-red-950/20 text-slate-700 hover:text-red-500 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CorpBankPage() {
  const { user } = useAuth();
  const [corp, setCorp] = useState<Corp | null>(null);
  const [items, setItems] = useState<BankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const loadBank = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/corp/bank');
      const data = await res.json();
      if (!res.ok) { setLoading(false); return; }
      setCorp(data.corporation ?? null);
      setItems(data.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) loadBank(); }, [user, loadBank]);

  const handleAdd = async (data: { itemType: ItemTypeValue; itemClassName: string; quantity: number; notes: string }) => {
    try {
      const res = await fetch('/api/corp/bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) { await loadBank(); setShowAddModal(false); }
    } catch {}
  };

  const handleRemove = async (id: number) => {
    try {
      await fetch(`/api/corp/bank/${id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {}
  };

  if (!user) return (
    <div className="p-8 text-center text-slate-500 font-mono-sc text-sm">Sign in to access the corp bank.</div>
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

  const filtered = items.filter((i) => {
    const matchType = filter === 'all' || i.itemType === filter;
    const q = search.toLowerCase();
    const matchSearch = !q || i.itemClassName.toLowerCase().includes(q) || i.notes?.toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  const countByType = ITEM_TYPES.reduce<Record<string, number>>((acc, t) => {
    acc[t.value] = items.filter((i) => i.itemType === t.value).length;
    return acc;
  }, {});

  return (
    <>
      <PageShell size="lg" className="p-4 md:p-6">
        <PageHeader
          eyebrow="Corporation"
          title="Corp Bank"
          subtitle={corp ? `[${corp.tag}] ${corp.name}` : 'Shared corporation inventory.'}
          actions={(
            <>
              <Link
                href="/corp/fleet"
                className="flex items-center gap-1.5 py-1.5 px-3 border border-slate-700/50 text-slate-500 hover:text-slate-300 hover:border-slate-600 font-mono-sc text-xs rounded-sm transition-colors"
              >
                <Package size={11} /> Fleet Manager
              </Link>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              disabled={!corp}
              className="sci-btn-primary py-1.5 px-3 text-xs gap-1.5 flex items-center disabled:opacity-40"
            >
              <Plus size={12} /> Add item
            </button>
            </>
          )}
        />

        <StatGrid>
          {ITEM_TYPES.map((t) => (
            <StatCard key={t.value} label={t.label} value={countByType[t.value] ?? 0} />
          ))}
        </StatGrid>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items…"
              className="w-full bg-slate-900/60 border border-slate-700/60 rounded-sm pl-9 pr-3 py-2 text-sm font-rajdhani text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-600 transition-colors"
            />
          </div>
          <div className="flex gap-1">
            {(['all', ...ITEM_TYPES.map((t) => t.value)] as string[]).map((v) => {
              const t = ITEM_TYPES.find((x) => x.value === v);
              const isActive = filter === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFilter(v)}
                  className={`px-3 py-2 rounded-sm text-[10px] font-orbitron font-bold tracking-widest uppercase border transition-all ${
                    isActive
                      ? v === 'all' ? 'bg-slate-800 border-slate-600 text-slate-200' : `${t?.color} ${t?.bg}`
                      : 'border-transparent text-slate-600 hover:text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {v === 'all' ? 'All' : t?.label ?? v}
                </button>
              );
            })}
          </div>
        </div>

        {/* Items list */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="sci-panel overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between">
            <span className="text-[10px] font-mono-sc text-cyan-700 uppercase tracking-wider">Inventory</span>
            <span className="text-[10px] text-slate-600">
              {filtered.length !== items.length ? `${filtered.length} / ${items.length}` : `${items.length} items`}
            </span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-600 text-sm font-mono-sc flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-700 text-sm font-mono-sc">
              {items.length === 0 ? 'No items declared yet. Add your equipment!' : 'No results.'}
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {filtered.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onRemove={() => handleRemove(item.id)}
                  canRemove={item.addedBy?.id === user?.id}
                />
              ))}
            </div>
          )}
        </motion.div>
      </PageShell>

      <AnimatePresence>
        {showAddModal && (
          <AddItemModal onClose={() => setShowAddModal(false)} onAdd={handleAdd} />
        )}
      </AnimatePresence>
    </>
  );
}
