'use client';

export const dynamic = 'force-dynamic';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Ship,
  Trash2,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { RsiOrgPicker, type RsiOrg } from '@/components/ui/RsiOrgPicker';
import { StatCard, StatGrid } from '@/components/ui/StatCard';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth, type AuthUser } from '@/contexts/AuthContext';
import { ADMIN_ROLE, DEVELOPER_ROLE, USER_ROLE, USER_ROLES } from '@/lib/app-constants';

// ── Types ────────────────────────────────────────────────────────────────────

type Role = (typeof USER_ROLES)[number];

interface AdminFleetItem {
  id: number;
  corporationId: number | null;
  itemType: string;
  itemClassName: string;
  shipUuid?: string | null;
  quantity: number;
  notes: string | null;
  addedAt: string;
  corporation?: { id: number; name: string; tag: string } | null;
}

interface DeveloperAccessRequest {
  id: number;
  userId: number;
  motivation: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  adminNote: string | null;
  createdAt: string;
  user?: {
    id: number;
    username: string;
    email: string;
    role: string;
  };
}

const ROLES = [...USER_ROLES];

const ROLE_STYLE: Record<Role, { label: string; badge: string }> = {
  [USER_ROLE]:      { label: 'User',      badge: 'text-slate-400 border-slate-700/50 bg-slate-900/60' },
  [DEVELOPER_ROLE]: { label: 'Developer', badge: 'text-violet-400 border-violet-700/50 bg-violet-950/40' },
  [ADMIN_ROLE]:     { label: 'Admin',     badge: 'text-cyan-400 border-cyan-700/50 bg-cyan-950/40' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const s = ROLE_STYLE[role as Role] ?? { label: role, badge: 'text-slate-500 border-slate-700' };
  return (
    <span className={`text-[10px] font-orbitron font-bold tracking-widest px-2 py-0.5 rounded-sm border ${s.badge}`}>
      {s.label.toUpperCase()}
    </span>
  );
}

function Avatar({ user }: { user: AuthUser }) {
  return (
    <div className="w-8 h-8 rounded-full bg-cyan-950 border border-cyan-700/30 flex items-center justify-center shrink-0 overflow-hidden">
      {user.avatarUrl
        ? <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
        : <span className="text-xs text-cyan-400 font-orbitron">{user.username[0].toUpperCase()}</span>}
    </div>
  );
}

// ── Modal base ────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15 }}
        className="relative w-full max-w-md sci-panel border border-border/80 shadow-2xl"
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
      {error && <p className="text-[10px] text-red-400 font-mono-sc">{error}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-slate-900/80 border border-slate-700 rounded-sm px-3 py-2 text-sm font-rajdhani text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-600 transition-colors ${props.className ?? ''}`}
    />
  );
}

function RoleSelect({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <div className="flex gap-1.5">
      {ROLES.map((r) => {
        const s = ROLE_STYLE[r];
        const active = value === r;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            className={`flex-1 py-1.5 rounded-sm text-[10px] font-orbitron font-bold tracking-widest uppercase border transition-all ${
              active ? s.badge : 'border-slate-800 text-slate-600 hover:text-slate-400 hover:border-slate-600'
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Modal: Edit user ──────────────────────────────────────────────────────────

function EditModal({ target, onClose, onSaved }: { target: AuthUser; onClose: () => void; onSaved: (u: AuthUser) => void }) {
  const [username, setUsername] = useState(target.username);
  const [email, setEmail] = useState(target.email);
  const [avatarUrl, setAvatarUrl] = useState(target.avatarUrl ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const data = await apiFetch(`/api/admin/users/${target.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, avatarUrl: avatarUrl || undefined }),
      });
      onSaved(data.user);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Edit — ${target.username}`} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label="Username" error={error && error.toLowerCase().includes('username') ? error : undefined}>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
        </Field>
        <Field label="Email" error={error && error.toLowerCase().includes('email') ? error : undefined}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
        </Field>
        <Field label="Avatar URL (optional)">
          <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
        </Field>
        {error && !error.toLowerCase().includes('email') && !error.toLowerCase().includes('username') && (
          <p className="text-[11px] text-red-400 font-mono-sc">{error}</p>
        )}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 sci-btn-ghost py-2 text-xs">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="flex-1 sci-btn-primary py-2 text-xs">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal: Change role ────────────────────────────────────────────────────────

function RoleModal({ target, onClose, onSaved }: { target: AuthUser; onClose: () => void; onSaved: (u: AuthUser) => void }) {
  const [role, setRole] = useState<Role>(target.role as Role);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const data = await apiFetch(`/api/admin/users/${target.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      onSaved(data.user);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Role — ${target.username}`} onClose={onClose}>
      <div className="space-y-4">
        <RoleSelect value={role} onChange={setRole} />
        {error && <p className="text-[11px] text-red-400 font-mono-sc">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 sci-btn-ghost py-2 text-xs">Cancel</button>
          <button type="button" onClick={save} disabled={saving || role === target.role} className="flex-1 sci-btn-primary py-2 text-xs disabled:opacity-40">
            {saving ? 'Saving…' : 'Apply'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal: Reset password ─────────────────────────────────────────────────────

function ResetPasswordModal({ target, onClose }: { target: AuthUser; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/admin/users/${target.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ password }),
      });
      setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Password — ${target.username}`} onClose={onClose}>
      {done ? (
        <div className="space-y-4 text-center py-2">
          <p className="text-green-400 font-mono-sc text-sm">Password reset.</p>
          <button type="button" onClick={onClose} className="sci-btn-primary py-2 px-6 text-xs">Close</button>
        </div>
      ) : (
        <div className="space-y-3.5">
          <Field label="New password" error={error}>
            <div className="relative">
              <Input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 chars, uppercase, digit, special"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
              >
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 sci-btn-ghost py-2 text-xs">Cancel</button>
            <button type="button" onClick={save} disabled={saving || password.length < 8} className="flex-1 sci-btn-primary py-2 text-xs disabled:opacity-40">
              {saving ? 'Saving…' : 'Reset'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Modal: Delete ─────────────────────────────────────────────────────────────

function DeleteModal({ target, onClose, onDeleted }: { target: AuthUser; onClose: () => void; onDeleted: (id: number) => void }) {
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    setDeleting(true);
    setError('');
    try {
      await apiFetch(`/api/admin/users/${target.id}`, { method: 'DELETE' });
      onDeleted(target.id);
    } catch (e: any) {
      setError(e.message);
      setDeleting(false);
    }
  };

  return (
    <Modal title="Confirm deletion" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-400 font-rajdhani">
          Permanently delete{' '}
          <span className="text-slate-200 font-semibold">{target.username}</span>{' '}
          <span className="text-slate-600">({target.email})</span>?
          This action is irreversible.
        </p>
        {error && <p className="text-[11px] text-red-400 font-mono-sc">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 sci-btn-ghost py-2 text-xs">Cancel</button>
          <button
            type="button"
            onClick={confirm}
            disabled={deleting}
            className="flex-1 py-2 text-xs font-orbitron font-bold tracking-widest uppercase rounded-sm border border-red-700/60 bg-red-950/30 text-red-400 hover:bg-red-950/60 transition-colors disabled:opacity-40"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal: Create user ────────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (u: AuthUser) => void }) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [role, setRole] = useState<Role>(USER_ROLE);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const data = await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password, role }),
      });
      onCreated(data.user);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Create user" onClose={onClose}>
      <div className="space-y-3.5">
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
        </Field>
        <Field label="Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
        </Field>
        <Field label="Password">
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 chars, uppercase, digit, special"
              className="pr-10"
            />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>
        <Field label="Role">
          <RoleSelect value={role} onChange={setRole} />
        </Field>
        {error && <p className="text-[11px] text-red-400 font-mono-sc">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 sci-btn-ghost py-2 text-xs">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="flex-1 sci-btn-primary py-2 text-xs">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal: Corp assignment ─────────────────────────────────────────────────────

function CorpModal({ target, onClose }: { target: AuthUser; onClose: () => void }) {
  const [currentOrg, setCurrentOrg] = useState<{ name: string; tag: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/admin/users/${target.id}/corporation`)
      .then((r) => r.json())
      .then((d) => setCurrentOrg(d.data?.corporation ?? null))
      .finally(() => setLoading(false));
  }, [target.id]);

  const handleAssign = async (org: RsiOrg) => {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/admin/users/${target.id}/corporation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: org.symbol, name: org.name, logoUrl: org.logoUrl,
          archetype: org.archetype, language: org.language, commitment: org.commitment,
          recruiting: org.recruiting, roleplay: org.roleplay, memberCount: org.memberCount,
        }),
      });
      setCurrentOrg({ name: org.name, tag: org.symbol });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/admin/users/${target.id}/corporation`, { method: 'DELETE' });
      setCurrentOrg(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Organization — ${target.username}`} onClose={onClose}>
      <div className="space-y-3">
        {loading ? (
          <p className="text-xs text-slate-600 font-mono-sc">Loading…</p>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              {currentOrg
                ? <>Current: <span className="text-cyan-400 font-orbitron">[{currentOrg.tag}] {currentOrg.name}</span></>
                : 'No organization assigned.'}
            </p>
            <RsiOrgPicker selected={null} onSelect={(org) => org && handleAssign(org)} disabled={saving} placeholder="Search RSI org to assign…" />
            {currentOrg && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={saving}
                className="text-[11px] text-red-500 hover:text-red-400 font-mono-sc transition-colors disabled:opacity-40"
              >
                Remove from organization
              </button>
            )}
            {error && <p className="text-[10px] text-red-400 font-mono-sc">{error}</p>}
          </>
        )}
      </div>
    </Modal>
  );
}

function UserFleetModal({ target, onClose }: { target: AuthUser; onClose: () => void }) {
  const [items, setItems] = useState<AdminFleetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [editing, setEditing] = useState<AdminFleetItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/admin/users/${target.id}/fleet`);
      setItems(data.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [target.id]);

  useEffect(() => { void load(); }, [load]);

  const remove = async (id: number) => {
    setBusy(id);
    try {
      await apiFetch(`/api/admin/fleet/${id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((item) => item.id !== id));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!editing) return;
    setBusy(editing.id);
    try {
      const data = await apiFetch(`/api/admin/fleet/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: editing.itemType,
          itemClassName: editing.itemClassName,
          quantity: editing.quantity,
          notes: editing.notes,
        }),
      });
      setItems((prev) => prev.map((item) => (item.id === editing.id ? data.data : item)));
      setEditing(null);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title={`Fleet — ${target.username}`} onClose={onClose}>
      <div className="space-y-3">
        {loading ? (
          <p className="py-4 text-center font-mono-sc text-xs text-slate-600">Loading...</p>
        ) : items.length === 0 ? (
          <p className="py-4 text-center font-mono-sc text-xs text-slate-600">No fleet or bank item declared by this user.</p>
        ) : (
          <div className="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
            {items.map((item) => (
              <div key={item.id} className="rounded-sm border border-slate-800/60 bg-slate-950/40 px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="w-20 shrink-0 font-orbitron text-[9px] uppercase tracking-widest text-slate-600">{item.itemType}</span>
                  <span className="min-w-0 flex-1 truncate font-mono-sc text-xs text-slate-300">{item.itemClassName}</span>
                  <span className="font-mono-sc text-[10px] text-slate-600">x{item.quantity}</span>
                  <button type="button" onClick={() => setEditing(item)} className="p-1 text-slate-700 hover:text-cyan-400">
                    <Pencil size={11} />
                  </button>
                  <button type="button" disabled={busy === item.id} onClick={() => remove(item.id)} className="p-1 text-slate-700 hover:text-red-500 disabled:opacity-40">
                    <Trash2 size={11} />
                  </button>
                </div>
                <p className="mt-1 truncate font-mono-sc text-[10px] text-slate-700">
                  {item.corporation ? `[${item.corporation.tag}] ${item.corporation.name}` : 'Personal fleet'}
                  {item.notes ? ` · ${item.notes}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}

        {editing && (
          <div className="space-y-2 rounded-sm border border-cyan-900/50 bg-cyan-950/10 p-3">
            <select value={editing.itemType} onChange={(event) => setEditing({ ...editing, itemType: event.target.value })} className="sci-input w-full text-xs">
              {['ship', 'component', 'item', 'commodity', 'other'].map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <Input value={editing.itemClassName} onChange={(event) => setEditing({ ...editing, itemClassName: event.target.value })} />
            <Input type="number" min={1} value={editing.quantity} onChange={(event) => setEditing({ ...editing, quantity: Math.max(1, Number(event.target.value)) })} />
            <Input value={editing.notes ?? ''} onChange={(event) => setEditing({ ...editing, notes: event.target.value || null })} placeholder="Notes" />
            <button type="button" onClick={save} disabled={busy === editing.id || !editing.itemClassName.trim()} className="sci-btn-primary w-full py-2 text-xs disabled:opacity-40">
              Save asset
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'edit'; user: AuthUser }
  | { type: 'role'; user: AuthUser }
  | { type: 'password'; user: AuthUser }
  | { type: 'delete'; user: AuthUser }
  | { type: 'create' }
  | { type: 'corp'; user: AuthUser }
  | { type: 'fleet'; user: AuthUser }
  | null;

export default function AdminPage() {
  const { user: me, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState('');
  const [apiRequests, setApiRequests] = useState<DeveloperAccessRequest[]>([]);
  const [apiRequestsLoading, setApiRequestsLoading] = useState(true);
  const [apiRequestsError, setApiRequestsError] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const loadUsers = useCallback(async () => {
    if (authLoading) return;
    if (me?.role !== ADMIN_ROLE) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Users request failed (${res.status})`);
      if (!Array.isArray(data.data)) throw new Error('Users response is invalid');
      setUsers(data.data);
    } catch (error) {
      setUsers([]);
      setLoadError(error instanceof Error ? error.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [authLoading, me?.role]);

  const loadApiRequests = useCallback(async () => {
    if (authLoading) return;
    if (me?.role !== ADMIN_ROLE) {
      setApiRequestsLoading(false);
      return;
    }

    setApiRequestsLoading(true);
    setApiRequestsError('');
    try {
      const data = await apiFetch('/api/admin/developer-access-requests?status=pending');
      setApiRequests(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      setApiRequests([]);
      setApiRequestsError(error instanceof Error ? error.message : 'Failed to load API access requests');
    } finally {
      setApiRequestsLoading(false);
    }
  }, [authLoading, me?.role]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadApiRequests();
  }, [loadApiRequests]);

  const updateUser = useCallback((updated: AuthUser) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setModal(null);
    showToast(`${updated.username} updated.`);
  }, [showToast]);

  const removeUser = useCallback((id: number) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setModal(null);
    showToast('User deleted.');
  }, [showToast]);

  const addUser = useCallback((created: AuthUser) => {
    setUsers((prev) => [created, ...prev]);
    setModal(null);
    showToast(`${created.username} created.`);
  }, [showToast]);

  const reviewApiRequest = useCallback(async (requestId: number, status: 'approved' | 'rejected') => {
    try {
      await apiFetch(`/api/admin/developer-access-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      showToast(status === 'approved' ? 'Developer access approved.' : 'Developer access rejected.');
      await Promise.all([loadApiRequests(), loadUsers()]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Request review failed.');
    }
  }, [loadApiRequests, loadUsers, showToast]);

  if (authLoading) {
    return (
      <div className="p-6 text-center text-slate-500 font-mono-sc text-sm">
        LOADING SESSION...
      </div>
    );
  }

  if (me?.role !== ADMIN_ROLE) {
    return (
      <div className="p-6 text-center text-slate-500 font-mono-sc text-sm">
        ACCESS DENIED — Admin role required
      </div>
    );
  }

  const filtered = users.filter((u) => {
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  const countByRole = ROLES.reduce<Record<string, number>>((acc, r) => {
    acc[r] = users.filter((u) => u.role === r).length;
    return acc;
  }, {});

  return (
    <>
      <PageShell size="lg" className="p-4 md:p-6">
        <PageHeader
          eyebrow="Administration"
          title="Users"
          subtitle="Manage accounts, roles, passwords and corporation links."
          actions={(
            <button
              type="button"
              onClick={() => setModal({ type: 'create' })}
              className="sci-btn-primary py-1.5 px-3 text-xs gap-1.5 flex items-center"
            >
              <Plus size={12} />
              Create account
            </button>
          )}
        />

        {/* Nav links */}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/corporations"
            className="flex items-center gap-2 sci-panel px-3 py-2.5 border border-slate-800/60 hover:border-cyan-800/50 text-slate-500 hover:text-cyan-400 transition-colors w-fit"
          >
            <Building2 size={13} />
            <span className="text-[10px] font-orbitron uppercase tracking-widest">Corporations</span>
          </Link>
          <Link
            href="/admin/monitoring"
            className="flex items-center gap-2 sci-panel px-3 py-2.5 border border-slate-800/60 hover:border-cyan-800/50 text-slate-500 hover:text-cyan-400 transition-colors w-fit"
          >
            <Activity size={13} />
            <span className="text-[10px] font-orbitron uppercase tracking-widest">Monitoring</span>
          </Link>
        </div>

        {/* Stats */}
        <StatGrid>
          <StatCard label="Total" value={users.length} />
          {ROLES.map((r) => {
            const s = ROLE_STYLE[r];
            return (
              <StatCard
                key={r}
                label={s.label}
                value={countByRole[r] ?? 0}
                accent={r === ADMIN_ROLE ? 'cyan' : r === DEVELOPER_ROLE ? 'purple' : 'slate'}
              />
            );
          })}
          <StatCard label="API requests" value={apiRequests.length} accent="cyan" />
        </StatGrid>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="sci-panel overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-[10px] font-mono-sc text-cyan-700 uppercase tracking-wider">
              <ClipboardCheck size={13} />
              External API access requests
            </span>
            <span className="text-[10px] text-slate-600">{apiRequests.length} pending</span>
          </div>

          {apiRequestsLoading ? (
            <div className="p-6 text-center text-slate-600 text-sm font-mono-sc">Loading requests...</div>
          ) : apiRequestsError ? (
            <div className="space-y-3 p-6 text-center">
              <p className="font-mono-sc text-sm text-red-400">{apiRequestsError}</p>
              <button type="button" onClick={() => void loadApiRequests()} className="sci-btn-ghost px-3 py-2 text-xs">
                Retry
              </button>
            </div>
          ) : apiRequests.length === 0 ? (
            <div className="p-6 text-center text-slate-700 text-sm font-mono-sc">No pending API access requests</div>
          ) : (
            <div className="divide-y divide-border/30">
              {apiRequests.map((request) => (
                <div key={request.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(180px,0.35fr)_minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <p className="truncate font-rajdhani text-sm font-semibold text-slate-200">{request.user?.username ?? `User #${request.userId}`}</p>
                    <p className="mt-0.5 truncate font-mono-sc text-[11px] text-slate-600">{request.user?.email ?? 'unknown email'}</p>
                    <p className="mt-2 font-mono-sc text-[10px] text-slate-700">
                      Sent {new Date(request.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </p>
                  </div>
                  <p className="whitespace-pre-wrap font-rajdhani text-sm leading-relaxed text-slate-400">{request.motivation}</p>
                  <div className="flex items-start gap-2 lg:flex-col">
                    <button
                      type="button"
                      onClick={() => void reviewApiRequest(request.id, 'approved')}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-emerald-800/50 bg-emerald-950/20 px-3 py-2 font-mono-sc text-xs text-emerald-400 transition-colors hover:border-emerald-600/70"
                    >
                      <CheckCircle2 size={13} />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void reviewApiRequest(request.id, 'rejected')}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-red-800/50 bg-red-950/20 px-3 py-2 font-mono-sc text-xs text-red-400 transition-colors hover:border-red-600/70"
                    >
                      <XCircle size={13} />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full bg-slate-900/60 border border-slate-700/60 rounded-sm pl-9 pr-3 py-2 text-sm font-rajdhani text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-600 transition-colors"
            />
          </div>
          <div className="flex gap-1">
            {(['all', ...ROLES] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-2 rounded-sm text-[10px] font-orbitron font-bold tracking-widest uppercase border transition-all ${
                  roleFilter === r
                    ? r === 'all' ? 'bg-slate-800 border-slate-600 text-slate-200'
                      : r === ADMIN_ROLE ? 'bg-cyan-950/60 border-cyan-700 text-cyan-400'
                      : r === DEVELOPER_ROLE ? 'bg-purple-950/60 border-purple-700 text-purple-400'
                      : 'bg-slate-800 border-slate-600 text-slate-300'
                    : 'border-transparent text-slate-600 hover:text-slate-400 hover:border-slate-700'
                }`}
              >
                {r === 'all' ? 'All' : ROLE_STYLE[r].label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="sci-panel overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between">
            <span className="text-[10px] font-mono-sc text-cyan-700 uppercase tracking-wider">Users</span>
            <span className="text-[10px] text-slate-600">
              {filtered.length !== users.length ? `${filtered.length} / ${users.length}` : `${users.length} accounts`}
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-600 text-sm font-mono-sc">Loading…</div>
          ) : loadError ? (
            <div className="space-y-3 p-8 text-center">
              <p className="font-mono-sc text-sm text-red-400">{loadError}</p>
              <button type="button" onClick={() => void loadUsers()} className="sci-btn-ghost px-3 py-2 text-xs">
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-700 text-sm font-mono-sc">No results</div>
          ) : (
            <div className="divide-y divide-border/30">
              {filtered.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
                  <Avatar user={u} />

                  {/* Identity */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-slate-200 font-rajdhani font-semibold truncate">{u.username}</span>
                      <RoleBadge role={u.role} />
                      {u.id === me?.id && (
                        <span className="text-[9px] font-orbitron text-slate-600 border border-slate-800 px-1 py-0.5 rounded-sm">YOU</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 truncate font-mono-sc mt-0.5">{u.email}</p>
                  </div>

                  {/* Date */}
                  <span className="hidden lg:block text-[10px] text-slate-700 font-mono-sc shrink-0 tabular-nums">
                    {new Date(u.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setModal({ type: 'corp', user: u })}
                      title="Corporation"
                      className="p-1.5 rounded border border-transparent hover:border-slate-700/50 hover:bg-white/5 text-slate-600 hover:text-cyan-400 transition-colors"
                    >
                      <Building2 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal({ type: 'fleet', user: u })}
                      title="Fleet and bank items"
                      className="p-1.5 rounded border border-transparent hover:border-slate-700/50 hover:bg-white/5 text-slate-600 hover:text-violet-400 transition-colors"
                    >
                      <Ship size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal({ type: 'edit', user: u })}
                      title="Edit"
                      className="p-1.5 rounded border border-transparent hover:border-slate-700/50 hover:bg-white/5 text-slate-600 hover:text-slate-300 transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal({ type: 'role', user: u })}
                      title="Change role"
                      className="p-1.5 rounded border border-transparent hover:border-slate-700/50 hover:bg-white/5 text-slate-600 hover:text-slate-300 transition-colors"
                    >
                      <UserCheck size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal({ type: 'password', user: u })}
                      title="Reset password"
                      className="p-1.5 rounded border border-transparent hover:border-slate-700/50 hover:bg-white/5 text-slate-600 hover:text-slate-300 transition-colors"
                    >
                      <KeyRound size={13} />
                    </button>
                    {u.id !== me?.id && (
                      <button
                        type="button"
                        onClick={() => setModal({ type: 'delete', user: u })}
                        title="Delete"
                        className="p-1.5 rounded border border-transparent hover:border-red-800/50 hover:bg-red-950/20 text-slate-700 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
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
        {modal?.type === 'edit'     && <EditModal          key="edit"     target={modal.user} onClose={() => setModal(null)} onSaved={updateUser} />}
        {modal?.type === 'role'     && <RoleModal          key="role"     target={modal.user} onClose={() => setModal(null)} onSaved={updateUser} />}
        {modal?.type === 'password' && <ResetPasswordModal key="password" target={modal.user} onClose={() => setModal(null)} />}
        {modal?.type === 'delete'   && <DeleteModal        key="delete"   target={modal.user} onClose={() => setModal(null)} onDeleted={removeUser} />}
        {modal?.type === 'create'   && <CreateModal        key="create"                       onClose={() => setModal(null)} onCreated={addUser} />}
        {modal?.type === 'corp'     && <CorpModal          key="corp"     target={modal.user} onClose={() => setModal(null)} />}
        {modal?.type === 'fleet'    && <UserFleetModal     key="fleet"    target={modal.user} onClose={() => setModal(null)} />}
      </AnimatePresence>
    </>
  );
}
