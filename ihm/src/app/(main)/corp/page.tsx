'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, Check, Crown, Package, ShieldCheck, Ship, UserCheck, UserMinus, Users, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type MemberRole = 'member' | 'leader';

interface Membership {
  id: number;
  role: MemberRole;
  status: string;
  declaredAt: string;
  user: { id: number; username: string; email: string; avatarUrl: string | null };
}

interface FleetItem {
  id: number;
  itemType: string;
  itemClassName: string;
  quantity: number;
}

interface CorpWorkspace {
  membership: Membership;
  corporation: { id: number; name: string; tag: string; logoUrl: string | null };
  members: Membership[];
  pendingMemberships: Membership[];
  fleet: FleetItem[];
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number | string }) {
  return (
    <div className="sci-panel px-3 py-2.5 border border-slate-800/60">
      <p className="font-mono-sc text-[9px] text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
        <Icon size={10} /> {label}
      </p>
      <p className="font-orbitron text-lg font-black text-slate-200 mt-0.5">{value}</p>
    </div>
  );
}

export default function CorpPage() {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<CorpWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/api/corp');
      setWorkspace(data.data ?? null);
    } catch (e: any) {
      setError(e.message);
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const isLeader = workspace?.membership.role === 'leader';
  const fleetCount = useMemo(() => workspace?.fleet.filter((i) => i.itemType === 'ship').length ?? 0, [workspace]);
  const bankCount = useMemo(() => workspace?.fleet.filter((i) => i.itemType !== 'ship').length ?? 0, [workspace]);

  const approve = async (id: number, role: MemberRole = 'member') => {
    setBusy(id);
    try {
      await apiFetch(`/api/corp/memberships/${id}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const reject = async (id: number) => {
    setBusy(id);
    try {
      await apiFetch(`/api/corp/memberships/${id}/reject`, { method: 'PUT' });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const setRole = async (id: number, role: MemberRole) => {
    setBusy(id);
    try {
      await apiFetch(`/api/corp/members/${id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const removeMember = async (id: number) => {
    setBusy(id);
    try {
      await apiFetch(`/api/corp/members/${id}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (!user) return <div className="p-8 text-center text-slate-500 font-mono-sc text-sm">Sign in to access corporation management.</div>;
  if (loading) return <div className="p-8 text-center text-slate-600 font-mono-sc text-sm">Loading corporation...</div>;
  if (error || !workspace) {
    return (
      <div className="p-8 text-center space-y-3">
        <Building2 size={32} className="text-slate-700 mx-auto" />
        <p className="text-slate-500 font-mono-sc text-sm">{error || 'No approved corporation membership.'}</p>
        <Link href="/profile" className="text-cyan-500 hover:text-cyan-300 text-xs font-mono-sc transition-colors">Request or manage membership</Link>
      </div>
    );
  }

  const corp = workspace.corporation;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-sm bg-cyan-950 border border-cyan-800/40 flex items-center justify-center overflow-hidden shrink-0">
            {corp.logoUrl ? <img src={corp.logoUrl} alt={corp.tag} className="w-full h-full object-cover" /> : <Building2 size={18} className="text-cyan-400" />}
          </div>
          <div className="min-w-0">
            <h1 className="font-orbitron text-lg font-bold text-white tracking-wider truncate">{corp.name}</h1>
            <p className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-widest">[{corp.tag}] corporation console</p>
          </div>
        </div>
        {isLeader && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-orbitron uppercase tracking-widest text-emerald-400 border border-emerald-800/50 bg-emerald-950/20 px-2 py-1 rounded-sm">
            <ShieldCheck size={11} /> Leader
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat icon={Users} label="Members" value={workspace.members.length} />
        <Stat icon={Ship} label="Fleet" value={fleetCount} />
        <Stat icon={Package} label="Bank Items" value={bankCount} />
        <Stat icon={Check} label="Pending" value={workspace.pendingMemberships.length} />
      </div>

      {isLeader && (
        <section className="grid gap-2 md:grid-cols-3">
          <Link href="/corp/fleet" className="sci-panel border border-slate-800/70 px-4 py-3 hover:border-cyan-700/60 transition-colors">
            <p className="font-mono-sc text-[9px] text-cyan-700 uppercase tracking-widest flex items-center gap-1.5">
              <Ship size={11} /> Fleet oversight
            </p>
            <p className="mt-1 text-xs text-slate-500 font-rajdhani">Review member ships and declared corporation assets.</p>
          </Link>
          <Link href="/corp/bank" className="sci-panel border border-slate-800/70 px-4 py-3 hover:border-cyan-700/60 transition-colors">
            <p className="font-mono-sc text-[9px] text-cyan-700 uppercase tracking-widest flex items-center gap-1.5">
              <Package size={11} /> Bank inventory
            </p>
            <p className="mt-1 text-xs text-slate-500 font-rajdhani">Track shared equipment, resources and logistics stock.</p>
          </Link>
          <div className="sci-panel border border-emerald-900/50 bg-emerald-950/10 px-4 py-3">
            <p className="font-mono-sc text-[9px] text-emerald-500 uppercase tracking-widest flex items-center gap-1.5">
              <ShieldCheck size={11} /> Leader controls
            </p>
            <p className="mt-1 text-xs text-slate-500 font-rajdhani">Approve recruits, assign leaders, reject requests and remove inactive members.</p>
          </div>
        </section>
      )}

      {isLeader && (
        <section className="sci-panel overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/50">
            <span className="text-[10px] font-mono-sc text-cyan-700 uppercase tracking-wider">Membership requests</span>
          </div>
          {workspace.pendingMemberships.length === 0 ? (
            <p className="p-4 text-xs text-slate-600 font-mono-sc">No pending requests.</p>
          ) : (
            <div className="divide-y divide-border/30">
              {workspace.pendingMemberships.map((m) => (
                <div key={m.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-rajdhani font-semibold text-slate-200 truncate">{m.user.username}</p>
                    <p className="text-[10px] text-slate-600 font-mono-sc truncate">{m.user.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy === m.id}
                      onClick={() => approve(m.id, 'member')}
                      className="sci-btn-primary inline-flex items-center gap-1.5 py-1.5 px-3 text-xs"
                    >
                      <UserCheck size={12} /> Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy === m.id}
                      onClick={() => approve(m.id, 'leader')}
                      className="inline-flex items-center gap-1.5 text-[10px] font-mono-sc text-emerald-400 hover:text-emerald-300 border border-emerald-900/60 bg-emerald-950/20 px-2.5 py-1.5 rounded-sm disabled:opacity-50"
                    >
                      <Crown size={12} /> Leader
                    </button>
                    <button
                      type="button"
                      disabled={busy === m.id}
                      onClick={() => reject(m.id)}
                      className="inline-flex items-center gap-1.5 text-[10px] font-mono-sc text-rose-400 hover:text-rose-300 border border-rose-900/60 bg-rose-950/20 px-2.5 py-1.5 rounded-sm disabled:opacity-50"
                    >
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="sci-panel overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between">
          <span className="text-[10px] font-mono-sc text-cyan-700 uppercase tracking-wider">Members</span>
          <div className="flex gap-3">
            <Link href="/corp/fleet" className="text-[10px] font-mono-sc text-slate-500 hover:text-cyan-400">Fleet</Link>
            <Link href="/corp/bank" className="text-[10px] font-mono-sc text-slate-500 hover:text-cyan-400">Bank</Link>
          </div>
        </div>
        <div className="divide-y divide-border/30">
          {workspace.members.map((m) => {
            const isSelf = m.id === workspace.membership.id;

            return (
              <div key={m.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-rajdhani font-semibold text-slate-200 truncate">{m.user.username}</p>
                    {m.role === 'leader' && <Crown size={12} className="text-emerald-400 shrink-0" />}
                    {isSelf && (
                      <span className="text-[9px] font-mono-sc uppercase tracking-widest text-cyan-400 border border-cyan-900/60 px-1.5 py-0.5 rounded-sm">
                        You
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-600 font-mono-sc truncate">{m.user.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-mono-sc uppercase tracking-wider text-slate-500 border border-slate-800 px-2 py-1 rounded-sm">
                    {m.role}
                  </span>
                  {isLeader && !isSelf && (
                    <>
                      <button
                        type="button"
                        disabled={busy === m.id}
                        onClick={() => setRole(m.id, m.role === 'leader' ? 'member' : 'leader')}
                        className="inline-flex items-center gap-1.5 text-[10px] font-mono-sc text-slate-500 hover:text-emerald-400 border border-slate-800 px-2 py-1 rounded-sm disabled:opacity-50"
                      >
                        {m.role === 'leader' ? <ShieldCheck size={12} /> : <Crown size={12} />}
                        {m.role === 'leader' ? 'Demote' : 'Make leader'}
                      </button>
                      <button
                        type="button"
                        disabled={busy === m.id}
                        onClick={() => removeMember(m.id)}
                        className="inline-flex items-center gap-1.5 text-[10px] font-mono-sc text-rose-400 hover:text-rose-300 border border-rose-900/60 bg-rose-950/10 px-2 py-1 rounded-sm disabled:opacity-50"
                      >
                        <UserMinus size={12} /> Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
