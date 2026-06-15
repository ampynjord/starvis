'use client';

export const dynamic = 'force-dynamic';

import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  Pencil,
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
import { API_BASE } from '@/utils/constants';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BankItem {
  id: number;
  itemType: string;
  itemClassName: string;
  itemName?: string | null;
  quantity: number;
  notes: string | null;
  addedAt: string;
  addedBy: { id: number; username: string } | null;
}

interface Corp { id: number; name: string; tag: string }

const ITEM_TYPES = [
  { value: 'component', label: 'Component', color: 'text-cyan-400',   bg: 'bg-cyan-950/30 border-cyan-800/40' },
  { value: 'item',      label: 'Item',      color: 'text-violet-400', bg: 'bg-violet-950/30 border-violet-800/40' },
  { value: 'commodity', label: 'Commodity', color: 'text-amber-400',  bg: 'bg-amber-950/30 border-amber-800/40' },
  { value: 'other',     label: 'Other',     color: 'text-slate-400',  bg: 'bg-slate-800/30 border-slate-700/40' },
] as const;

type ItemTypeValue = (typeof ITEM_TYPES)[number]['value'];

// ── Add item modal ────────────────────────────────────────────────────────────

function AddItemModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (data: { itemType: ItemTypeValue; itemClassName: string; quantity: number; notes: string }) => void;
}) {
  const [itemType, setItemType] = useState<ItemTypeValue>('component');
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
        component: `${API_BASE}/components?search=${encodeURIComponent(q)}&limit=8`,
        item: `${API_BASE}/items?search=${encodeURIComponent(q)}&limit=8`,
        commodity: `${API_BASE}/commodities?search=${encodeURIComponent(q)}&limit=8`,
      };
      const endpoint = endpointMap[itemType];
      if (endpoint) {
        const res = await fetch(endpoint);
        const data = await res.json();
        setSearchResults((data.data ?? []).map((c: any) => ({ class_name: c.class_name, name: c.display_name ?? c.name ?? 'Unnamed item' })));
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
              {itemType === 'other' ? 'Name' : 'Search'}
            </label>
            <div className="relative">
              <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => setShowSearch(true)}
                placeholder={itemType === 'other' ? 'Enter item name…' : `Search ${itemType}s…`}
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
                  </button>
                ))}
              </div>
            )}
            {itemType === 'other' && (
              <p className="text-[10px] text-slate-600">Use this only when the item is not available in search yet.</p>
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

function EditItemModal({ item, onClose, onSave }: {
  item: BankItem;
  onClose: () => void;
  onSave: (id: number, data: { itemType: ItemTypeValue; itemClassName: string; quantity: number; notes: string }) => void;
}) {
  const [itemType, setItemType] = useState<ItemTypeValue>(ITEM_TYPES.some((t) => t.value === item.itemType) ? item.itemType as ItemTypeValue : 'other');
  const [itemClassName, setItemClassName] = useState(item.itemClassName);
  const [quantity, setQuantity] = useState(item.quantity);
  const [notes, setNotes] = useState(item.notes ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="relative w-full max-w-md sci-panel border border-border/80 p-4">
        <div className="mb-3 flex items-center justify-between border-b border-border/50 pb-3">
          <span className="font-orbitron text-xs font-bold uppercase tracking-widest text-slate-300">Edit bank item</span>
          <button type="button" onClick={onClose} className="text-slate-600 hover:text-slate-300"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <select value={itemType} onChange={(event) => setItemType(event.target.value as ItemTypeValue)} className="sci-input w-full">
            {ITEM_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <input value={itemClassName} onChange={(event) => setItemClassName(event.target.value)} className="sci-input w-full text-sm" placeholder="Item identifier" />
          <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} className="sci-input w-full" />
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes..." className="sci-input w-full text-sm" />
          <button
            type="button"
            onClick={() => onSave(item.id, { itemType, itemClassName: itemClassName.trim(), quantity, notes })}
            disabled={!itemClassName.trim()}
            className="sci-btn-primary w-full py-2 text-xs disabled:opacity-40"
          >
            Save item
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ItemRow({ item, onRemove, onEdit, canManage }: { item: BankItem; onRemove: () => void; onEdit: () => void; canManage: boolean }) {
  const typeStyle = ITEM_TYPES.find((t) => t.value === item.itemType) ?? ITEM_TYPES[3];
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-rajdhani font-semibold text-slate-200 truncate">{item.itemName ?? 'Declared item'}</span>
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
      {canManage && (
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded border border-transparent hover:border-cyan-800/50 hover:bg-cyan-950/20 text-slate-700 hover:text-cyan-500 transition-colors"
        >
          <Pencil size={13} />
        </button>
      )}
      {canManage && (
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
  const [editingItem, setEditingItem] = useState<BankItem | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [canManageBank, setCanManageBank] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');

  const loadBank = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/corp/bank');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Corp bank request failed (${res.status})`);
      setCorp(data.corporation ?? null);
      setItems(data.data ?? []);
      setCanManageBank(Boolean(data.canManage));
    } catch (error) {
      setCorp(null);
      setItems([]);
      setCanManageBank(false);
      setLoadError(error instanceof Error ? error.message : 'Failed to load corp bank');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) loadBank(); }, [user, loadBank]);

  const handleAdd = async (data: { itemType: ItemTypeValue; itemClassName: string; quantity: number; notes: string }) => {
    try {
      setError('');
      const res = await fetch('/api/corp/bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Failed to add item');
      await loadBank();
      setShowAddModal(false);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleRemove = async (id: number) => {
    try {
      setError('');
      const res = await fetch(`/api/corp/bank/${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Failed to remove item');
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleUpdate = async (id: number, data: { itemType: ItemTypeValue; itemClassName: string; quantity: number; notes: string }) => {
    try {
      setError('');
      const res = await fetch(`/api/corp/bank/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Failed to update item');
      await loadBank();
      setEditingItem(null);
    } catch (e: any) {
      setError(e.message);
    }
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
    const matchSearch = !q || (i.itemName ?? '').toLowerCase().includes(q) || i.notes?.toLowerCase().includes(q);
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
        {error && <div className="rounded-sm border border-red-800/50 bg-red-950/20 px-3 py-2 font-mono-sc text-xs text-red-400">{error}</div>}

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
          ) : loadError ? (
            <div className="space-y-3 p-8 text-center">
              <p className="font-mono-sc text-sm text-red-400">{loadError}</p>
              <button type="button" onClick={() => void loadBank()} className="sci-btn-ghost px-3 py-2 text-xs">
                Retry
              </button>
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
                  onEdit={() => setEditingItem(item)}
                  canManage={canManageBank || item.addedBy?.id === user?.id}
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
        {editingItem && (
          <EditItemModal item={editingItem} onClose={() => setEditingItem(null)} onSave={handleUpdate} />
        )}
      </AnimatePresence>
    </>
  );
}
