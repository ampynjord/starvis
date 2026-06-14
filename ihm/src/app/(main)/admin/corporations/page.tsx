'use client';

export const dynamic = 'force-dynamic';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  Package,
  Pencil,
  Plus,
  Search,
  Ship,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { RsiOrgPicker, type RsiOrg } from '@/components/ui/RsiOrgPicker';
import { StatCard, StatGrid } from '@/components/ui/StatCard';
import { useAuth } from '@/contexts/AuthContext';
import { ADMIN_ROLE } from '@/lib/app-constants';

// ── Types ────────────────────────────────────────────────────────────────────

interface Corporation {
  id: number;
  name: string;
  tag: string | null;
  description: string | null;
  logoUrl: string | null;
  createdAt: string;
  _count: { memberships: number; fleetItems: number; bankItems?: number; pendingMemberships?: number };
}

interface Membership {
  id: number;
  userId: number;
  corporationId: number;
  rank: string | null;
  role: 'member' | 'leader';
  status: 'pending' | 'active' | 'rejected';
  declaredAt: string;
  user: { id: number; username: string; email: string; avatarUrl: string | null };
  corporation?: { id: number; name: string; tag: string };
}

interface FleetItem {
  id: number;
  corporationId: number;
  itemType: string;
  itemClassName: string;
  quantity: number;
  notes: string | null;
  addedAt: string;
  addedBy?: { id: number; username: string } | null;
}

const FLEET_TYPES = ['ship', 'component', 'item', 'commodity', 'other'] as const;
type FleetType = (typeof FLEET_TYPES)[number];

const FLEET_TYPE_STYLE: Record<FleetType, { label: string; color: string; icon: React.ReactNode }> = {
  ship:      { label: 'Ship',      color: 'text-cyan-400',   icon: <Ship size={11} /> },
  component: { label: 'Component', color: 'text-blue-400',   icon: <Package size={11} /> },
  item:      { label: 'Item',      color: 'text-violet-400', icon: <Package size={11} /> },
  commodity: { label: 'Commodity', color: 'text-amber-400',  icon: <Package size={11} /> },
  other:     { label: 'Other',     color: 'text-slate-400',  icon: <Package size={11} /> },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

// ── Modal base ────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
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
        className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-md'} sci-panel border border-border/80 shadow-2xl`}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50">
          <span className="text-xs font-orbitron font-bold text-slate-300 tracking-widest uppercase">{title}</span>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-300 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </motion.div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-orbitron tracking-widest text-slate-500 uppercase">{label}</label>
      {children}
      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}

function SciBtnPrimary({ onClick, disabled, children }: { onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      onClick={onClick}
      disabled={disabled}
      className="w-full py-2 px-4 bg-cyan-900/40 border border-cyan-700/50 hover:border-cyan-500/70 hover:bg-cyan-900/60 text-cyan-300 font-mono-sc text-xs rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

// ── Corp form modal ───────────────────────────────────────────────────────────

function ImportCorpModal({ onClose, onSaved }: { onClose: () => void; onSaved: (c: Corporation) => void }) {
  const [selectedOrg, setSelectedOrg] = useState<RsiOrg | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/api/admin/corporations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedOrg.symbol,
          name: selectedOrg.name,
          logoUrl: selectedOrg.logoUrl,
          archetype: selectedOrg.archetype,
          language: selectedOrg.language,
          commitment: selectedOrg.commitment,
          recruiting: selectedOrg.recruiting,
          roleplay: selectedOrg.roleplay,
          memberCount: selectedOrg.memberCount,
        }),
      });
      onSaved(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Import Corporation" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="RSI organization *">
          <RsiOrgPicker
            selected={selectedOrg}
            onSelect={setSelectedOrg}
            disabled={loading}
            placeholder="Search RSI organization by name or tag..."
          />
        </Field>
        {selectedOrg && (
          <div className="border border-slate-800/70 bg-slate-950/40 rounded-sm px-3 py-2 text-xs text-slate-500 font-mono-sc">
            Import [{selectedOrg.symbol}] {selectedOrg.name} from live RSI data.
          </div>
        )}
        {error && <p className="text-xs text-red-400 font-mono-sc bg-red-950/30 border border-red-800/30 rounded px-3 py-2">{error}</p>}
        <SciBtnPrimary disabled={loading || !selectedOrg}>{loading ? 'Importing...' : 'Import Corporation'}</SciBtnPrimary>
      </form>
    </Modal>
  );
}

function CorpFormModal({
  corp,
  onClose,
  onSaved,
}: {
  corp: Corporation;
  onClose: () => void;
  onSaved: (c: Corporation) => void;
}) {
  const [name, setName] = useState(corp?.name ?? '');
  const [tag, setTag] = useState(corp?.tag ?? '');
  const [description, setDescription] = useState(corp?.description ?? '');
  const [logoUrl, setLogoUrl] = useState(corp?.logoUrl ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const body = { name, tag: tag || null, description: description || null, logoUrl: logoUrl || null };
      const data = await apiFetch(`/api/admin/corporations/${corp.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      onSaved(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Edit Corporation" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Name *">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Stellar Dynamics" required minLength={2} className="sci-input w-full" />
        </Field>
        <Field label="Tag (≤10 chars)">
          <input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} placeholder="STAR" maxLength={10} className="sci-input w-full font-mono-sc" />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Short description…" className="sci-input w-full resize-none text-sm" />
        </Field>
        <Field label="Logo URL">
          <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" className="sci-input w-full text-sm" />
        </Field>
        {error && <p className="text-xs text-red-400 font-mono-sc bg-red-950/30 border border-red-800/30 rounded px-3 py-2">{error}</p>}
        <SciBtnPrimary disabled={loading || !name.trim()}>{loading ? 'Saving...' : 'Save Changes'}</SciBtnPrimary>
      </form>
    </Modal>
  );
}

// ── Delete corp modal ─────────────────────────────────────────────────────────

function DeleteCorpModal({ corp, onClose, onDeleted }: { corp: Corporation; onClose: () => void; onDeleted: (corp: Corporation) => void }) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/admin/corporations/${corp.id}`, { method: 'DELETE' });
      onDeleted(corp);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Delete Corporation" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          Delete <span className="text-white font-semibold">{corp.name}</span> from Starvis? This removes its memberships,
          pending requests, corporation fleet and corporation bank items. Users and personal fleet managers are kept.
        </p>
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="w-full py-2 px-4 bg-red-950/40 border border-red-700/50 hover:border-red-500 text-red-400 font-mono-sc text-xs rounded transition-colors disabled:opacity-40"
        >
          {loading ? 'Deleting...' : 'Delete Corporation'}
        </button>
      </div>
    </Modal>
  );
}

// ── Members modal ─────────────────────────────────────────────────────────────

function MembersModal({ corp, onClose }: { corp: Corporation; onClose: () => void }) {
  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  // Add member state
  const [addQuery, setAddQuery] = useState('');
  const [allUsers, setAllUsers] = useState<{ id: number; username: string; email: string }[]>([]);
  const [addLoading, setAddLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/admin/corporations/${corp.id}/members`);
      setMembers(data.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [corp.id]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  useEffect(() => {
    if (showAdd && allUsers.length === 0) {
      apiFetch('/api/admin/users').then((d) => setAllUsers(d.data ?? [])).catch(() => {});
    }
  }, [showAdd, allUsers.length]);

  const memberIds = new Set(members.map((m) => m.user.id));
  const filteredUsers = allUsers.filter((u) => {
    if (memberIds.has(u.id)) return false;
    const q = addQuery.toLowerCase();
    return !q || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const addMember = async (userId: number) => {
    setAddLoading(true);
    try {
      await apiFetch(`/api/admin/corporations/${corp.id}/members/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      await loadMembers();
      setAddQuery('');
      setShowAdd(false);
    } finally {
      setAddLoading(false);
    }
  };

  const remove = async (mid: number) => {
    setActionLoading(mid);
    try {
      await apiFetch(`/api/admin/corporations/members/${mid}`, { method: 'DELETE' });
      setMembers((prev) => prev.filter((m) => m.id !== mid));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Modal title={`Members — ${corp.name}`} onClose={onClose} wide>
      <div className="space-y-3">
        {/* Add member panel */}
        <div className="border border-slate-800/60 rounded-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-orbitron text-cyan-600 hover:text-cyan-400 hover:bg-white/5 transition-colors uppercase tracking-widest"
          >
            <Plus size={11} /> Add member {showAdd ? '▴' : '▾'}
          </button>
          {showAdd && (
            <div className="border-t border-slate-800/60 p-2 space-y-1.5">
              <div className="relative">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600" />
                <input
                  autoFocus
                  value={addQuery}
                  onChange={(e) => setAddQuery(e.target.value)}
                  placeholder="Search by username or email…"
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-sm pl-6 pr-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-700 transition-colors"
                />
              </div>
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {filteredUsers.length === 0 ? (
                  <p className="text-xs text-slate-600 font-mono-sc px-2 py-1">
                    {addQuery ? 'No user found' : 'All users are already members'}
                  </p>
                ) : (
                  filteredUsers.slice(0, 8).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      disabled={addLoading}
                      onClick={() => addMember(u.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-white/5 rounded-sm transition-colors disabled:opacity-40"
                    >
                      <span className="text-sm font-rajdhani text-slate-200">{u.username}</span>
                      <span className="text-[10px] text-slate-600 font-mono-sc">{u.email}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

      <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
        {loading ? (
          <p className="text-sm text-slate-600 font-mono-sc text-center py-4">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-slate-600 font-mono-sc text-center py-4">No members yet.</p>
        ) : (
          members.map((m) => {
            const busy = actionLoading === m.id;
            return (
              <div key={m.id} className="flex items-center gap-3 py-2.5 px-3 border border-slate-800/50 rounded-sm bg-slate-900/40">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-slate-200 font-rajdhani font-semibold">{m.user.username}</span>
                  <p className="text-[11px] text-slate-600 font-mono-sc">{m.user.email}</p>
                  <p className="text-[10px] text-slate-700 mt-0.5">Since {new Date(m.declaredAt).toLocaleDateString()}</p>
                </div>
                <button disabled={busy} onClick={() => remove(m.id)} title="Remove" className="p-1.5 rounded border border-transparent hover:border-red-800/50 hover:bg-red-950/20 text-slate-700 hover:text-red-500 transition-colors disabled:opacity-40">
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>
      </div>
    </Modal>
  );
}

// ── Fleet modal ───────────────────────────────────────────────────────────────

function FleetModal({ corp, onClose }: { corp: Corporation; onClose: () => void }) {
  const [fleet, setFleet] = useState<FleetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<FleetType>('ship');
  const [addClass, setAddClass] = useState('');
  const [addQty, setAddQty] = useState(1);
  const [addNotes, setAddNotes] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const loadFleet = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/admin/corporations/${corp.id}/fleet`);
      setFleet(data.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [corp.id]);

  useEffect(() => { loadFleet(); }, [loadFleet]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addClass.trim()) return;
    setAddLoading(true);
    try {
      await apiFetch(`/api/admin/corporations/${corp.id}/fleet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType: addType, itemClassName: addClass.trim(), quantity: addQty, notes: addNotes || null }),
      });
      setAddClass('');
      setAddQty(1);
      setAddNotes('');
      setShowAdd(false);
      await loadFleet();
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (fid: number) => {
    setDeleting(fid);
    try {
      await apiFetch(`/api/admin/corporations/fleet/${fid}`, { method: 'DELETE' });
      setFleet((prev) => prev.filter((f) => f.id !== fid));
    } finally {
      setDeleting(null);
    }
  };

  const grouped = FLEET_TYPES.reduce<Record<FleetType, FleetItem[]>>((acc, t) => {
    acc[t] = fleet.filter((f) => f.itemType === t);
    return acc;
  }, {} as Record<FleetType, FleetItem[]>);

  return (
    <Modal title={`Fleet — ${corp.name}`} onClose={onClose} wide>
      <div className="space-y-3">
        {/* Add form */}
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 text-[10px] font-orbitron text-cyan-500 hover:text-cyan-300 transition-colors"
        >
          <Plus size={11} /> Add item {showAdd ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>

        {showAdd && (
          <form onSubmit={handleAdd} className="border border-slate-700/50 rounded-sm p-3 space-y-2 bg-slate-900/40">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Type *">
                <select value={addType} onChange={(e) => setAddType(e.target.value as FleetType)} className="sci-input w-full text-xs">
                  {FLEET_TYPES.map((t) => <option key={t} value={t}>{FLEET_TYPE_STYLE[t].label}</option>)}
                </select>
              </Field>
              <Field label="Qty">
                <input type="number" min={1} value={addQty} onChange={(e) => setAddQty(Number(e.target.value))} className="sci-input w-full" />
              </Field>
            </div>
            <Field label="Class name *">
              <input value={addClass} onChange={(e) => setAddClass(e.target.value)} placeholder="e.g. AEGS_Avenger_Titan" required className="sci-input w-full font-mono-sc text-xs" />
            </Field>
            <Field label="Notes">
              <input value={addNotes} onChange={(e) => setAddNotes(e.target.value)} placeholder="Optional notes…" className="sci-input w-full text-xs" />
            </Field>
            <button
              type="submit"
              disabled={addLoading || !addClass.trim()}
              className="py-1.5 px-3 bg-cyan-900/40 border border-cyan-700/50 text-cyan-300 font-mono-sc text-xs rounded transition-colors disabled:opacity-40"
            >
              {addLoading ? 'Adding…' : 'Add'}
            </button>
          </form>
        )}

        {/* Fleet list grouped by type */}
        <div className="max-h-[55vh] overflow-y-auto space-y-3 pr-1">
          {loading ? (
            <p className="text-sm text-slate-600 font-mono-sc text-center py-4">Loading…</p>
          ) : fleet.length === 0 ? (
            <p className="text-sm text-slate-600 font-mono-sc text-center py-4">No fleet items declared.</p>
          ) : (
            FLEET_TYPES.map((t) => {
              const items = grouped[t];
              if (!items.length) return null;
              const s = FLEET_TYPE_STYLE[t];
              return (
                <div key={t}>
                  <div className={`flex items-center gap-1.5 mb-1 ${s.color} text-[10px] font-orbitron uppercase tracking-widest`}>
                    {s.icon} {s.label} ({items.length})
                  </div>
                  <div className="space-y-1">
                    {items.map((f) => (
                      <div key={f.id} className="flex items-center gap-2 py-1.5 px-2.5 border border-slate-800/40 rounded-sm bg-slate-900/30">
                        <span className="text-[11px] font-mono-sc text-slate-300 flex-1 truncate">{f.itemClassName}</span>
                        <span className="text-[10px] text-slate-500 shrink-0">×{f.quantity}</span>
                        {f.notes && <span className="text-[10px] text-slate-600 hidden sm:block truncate max-w-[120px]">{f.notes}</span>}
                        <button
                          disabled={deleting === f.id}
                          onClick={() => handleDelete(f.id)}
                          className="p-1 text-slate-700 hover:text-red-500 transition-colors disabled:opacity-40"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}


// ── Main page ─────────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'import' }
  | { type: 'edit'; corp: Corporation }
  | { type: 'delete'; corp: Corporation }
  | { type: 'members'; corp: Corporation }
  | { type: 'fleet'; corp: Corporation }
  | null;

export default function CorporationsPage() {
  const { user: me } = useAuth();
  const [corps, setCorps] = useState<Corporation[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const loadCorps = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/admin/corporations');
      setCorps(data.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (me?.role !== ADMIN_ROLE) return;
    loadCorps();
  }, [me, loadCorps]);

  if (me?.role !== ADMIN_ROLE) {
    return <div className="p-6 text-center text-slate-500 font-mono-sc text-sm">ACCESS DENIED — Admin role required</div>;
  }

  const onSaved = (corp: Corporation) => {
    setCorps((prev) => {
      const idx = prev.findIndex((c) => c.id === corp.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = corp;
        return next;
      }
      return [corp, ...prev];
    });
    setModal(null);
    showToast(`${corp.name} saved.`);
  };

  const onDeleted = (corp: Corporation) => {
    setCorps((prev) => prev.filter((c) => c.id !== corp.id));
    setModal(null);
    showToast(`${corp.name} deleted. Personal fleets kept.`);
  };

  return (
    <>
      <PageShell size="lg" className="p-4 md:p-6">
        <PageHeader
          eyebrow="Administration"
          title="Corporations"
          subtitle="Import RSI organizations and manage Starvis corporation data."
          actions={(
            <div className="flex items-center gap-2">
            <Link href="/admin" className="text-slate-600 hover:text-slate-300 transition-colors">
              <ArrowLeft size={16} />
            </Link>
              <button
                type="button"
                onClick={() => setModal({ type: 'import' })}
                className="sci-btn-primary py-1.5 px-3 text-xs gap-1.5 flex items-center"
              >
                <Plus size={12} /> Import Corporation
              </button>
            </div>
          )}
        />

        {/* Stats bar */}
        <StatGrid>
          <StatCard icon={Building2} label="Corporations" value={corps.length} />
          <StatCard icon={Users} label="Total Members" value={corps.reduce((s, c) => s + c._count.memberships, 0)} accent="cyan" />
          <StatCard icon={Ship} label="Fleet Items" value={corps.reduce((s, c) => s + c._count.fleetItems, 0)} accent="purple" />
          <StatCard icon={Package} label="Bank Items" value={corps.reduce((s, c) => s + (c._count.bankItems ?? 0), 0)} accent="amber" />
        </StatGrid>



        {/* Corps table */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="sci-panel overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/50">
            <span className="text-[10px] font-mono-sc text-cyan-700 uppercase tracking-wider">All Corporations</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-600 text-sm font-mono-sc">Loading…</div>
          ) : corps.length === 0 ? (
            <div className="p-8 text-center text-slate-700 text-sm font-mono-sc">No corporations yet.</div>
          ) : (
            <div className="divide-y divide-border/30">
              {corps.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
                  {/* Logo / initials */}
                  <div className="w-9 h-9 rounded-sm bg-cyan-950 border border-cyan-800/30 flex items-center justify-center shrink-0 overflow-hidden">
                    {c.logoUrl
                      ? <img src={c.logoUrl} alt={c.name} className="w-full h-full object-cover" />
                      : <span className="text-xs text-cyan-400 font-orbitron font-bold">{c.name[0]}</span>}
                  </div>

                  {/* Identity */}
                  <Link href={`/admin/corporations/${c.id}`} className="flex-1 min-w-0 group">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-slate-200 group-hover:text-cyan-300 font-rajdhani font-semibold truncate">{c.name}</span>
                      {c.tag && (
                        <span className="text-[9px] font-orbitron font-bold text-slate-500 border border-slate-700/50 px-1.5 py-0.5 rounded-sm">
                          [{c.tag}]
                        </span>
                      )}
                      {(c._count.pendingMemberships ?? 0) > 0 && (
                        <span className="text-[9px] font-orbitron font-bold text-amber-400 border border-amber-800/50 bg-amber-950/20 px-1.5 py-0.5 rounded-sm">
                          {c._count.pendingMemberships} pending
                        </span>
                      )}
                    </div>
                    {c.description && <p className="text-[11px] text-slate-600 truncate mt-0.5">{c.description}</p>}
                  </Link>

                  {/* Counts */}
                  <div className="hidden sm:flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => setModal({ type: 'members', corp: c })}
                      className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-cyan-400 transition-colors font-mono-sc"
                      title="View members"
                    >
                      <Users size={11} /> {c._count.memberships}
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal({ type: 'fleet', corp: c })}
                      className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-violet-400 transition-colors font-mono-sc"
                      title="View fleet"
                    >
                      <Ship size={11} /> {c._count.fleetItems}
                    </button>
                    <span className="flex items-center gap-1 text-[10px] text-slate-500 font-mono-sc" title="Bank items">
                      <Package size={11} /> {c._count.bankItems ?? 0}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => setModal({ type: 'members', corp: c })} title="Members" className="p-1.5 rounded border border-transparent hover:border-slate-700/50 hover:bg-white/5 text-slate-600 hover:text-cyan-400 transition-colors sm:hidden">
                      <Users size={13} />
                    </button>
                    <button type="button" onClick={() => setModal({ type: 'fleet', corp: c })} title="Fleet" className="p-1.5 rounded border border-transparent hover:border-slate-700/50 hover:bg-white/5 text-slate-600 hover:text-violet-400 transition-colors sm:hidden">
                      <Ship size={13} />
                    </button>
                    <button type="button" onClick={() => setModal({ type: 'edit', corp: c })} title="Edit" className="p-1.5 rounded border border-transparent hover:border-slate-700/50 hover:bg-white/5 text-slate-600 hover:text-slate-300 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={() => setModal({ type: 'delete', corp: c })} title="Delete corporation" className="p-1.5 rounded border border-transparent hover:border-red-800/50 hover:bg-red-950/20 text-slate-700 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </PageShell>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-green-800/60 text-green-400 text-xs font-mono-sc px-4 py-2.5 rounded-sm shadow-xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {modal?.type === 'import'  && <ImportCorpModal key="import"  onClose={() => setModal(null)} onSaved={onSaved} />}
        {modal?.type === 'edit'    && <CorpFormModal key="edit"    corp={modal.corp} onClose={() => setModal(null)} onSaved={onSaved} />}
        {modal?.type === 'delete'  && <DeleteCorpModal key="delete" corp={modal.corp} onClose={() => setModal(null)} onDeleted={onDeleted} />}
        {modal?.type === 'members' && <MembersModal key="members" corp={modal.corp} onClose={() => setModal(null)} />}
        {modal?.type === 'fleet'   && <FleetModal key="fleet" corp={modal.corp} onClose={() => setModal(null)} />}
      </AnimatePresence>
    </>
  );
}
