'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Building2, Check, Package, ShieldCheck, Ship, Trash2, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { StatCard, StatGrid } from '@/components/ui/StatCard';
import { useAuth } from '@/contexts/AuthContext';
import { ADMIN_ROLE } from '@/lib/app-constants';

type MemberRole = 'member' | 'leader';

interface Corporation {
  id: number;
  name: string;
  tag: string;
  description: string | null;
  logoUrl: string | null;
  _count: { memberships: number; fleetItems: number; bankItems?: number; pendingMemberships?: number };
}

interface Membership {
  id: number;
  corporationId: number;
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
  notes: string | null;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

export default function AdminCorporationDetailPage() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const [corp, setCorp] = useState<Corporation | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [pending, setPending] = useState<Membership[]>([]);
  const [fleet, setFleet] = useState<FleetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!Number.isInteger(id)) return;
    setLoading(true);
    try {
      const [corpData, membersData, pendingData, fleetData] = await Promise.all([
        apiFetch(`/api/admin/corporations/${id}`),
        apiFetch(`/api/admin/corporations/${id}/members`),
        apiFetch('/api/admin/corporations/pending'),
        apiFetch(`/api/admin/corporations/${id}/fleet`),
      ]);
      setCorp(corpData.data ?? null);
      setMembers(membersData.data ?? []);
      setPending((pendingData.data ?? []).filter((m: Membership) => m.corporationId === id));
      setFleet(fleetData.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (user?.role === ADMIN_ROLE) void load();
  }, [user, load]);

  const fleetCount = useMemo(() => fleet.filter((i) => i.itemType === 'ship').length, [fleet]);
  const bankCount = useMemo(() => fleet.filter((i) => i.itemType !== 'ship').length, [fleet]);

  const approve = async (membershipId: number, role: MemberRole = 'member') => {
    setBusy(membershipId);
    try {
      await apiFetch(`/api/admin/corporations/memberships/${membershipId}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const setRole = async (membershipId: number, role: MemberRole) => {
    setBusy(membershipId);
    try {
      await apiFetch(`/api/admin/corporations/members/${membershipId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const removeAsset = async (assetId: number) => {
    setBusy(assetId);
    try {
      await apiFetch(`/api/admin/fleet/${assetId}`, { method: 'DELETE' });
      setFleet((prev) => prev.filter((item) => item.id !== assetId));
    } finally {
      setBusy(null);
    }
  };

  if (user?.role !== ADMIN_ROLE) return <div className="p-6 text-center text-slate-500 font-mono-sc text-sm">ACCESS DENIED - Admin role required</div>;
  if (loading) return <div className="p-8 text-center text-slate-600 font-mono-sc text-sm">Loading corporation...</div>;
  if (!corp) return <div className="p-8 text-center text-slate-600 font-mono-sc text-sm">Corporation not found.</div>;

  return (
    <PageShell size="xl" className="p-4 md:p-6">
      <PageHeader
        eyebrow="Administration"
        title={corp.name}
        subtitle={`[${corp.tag}] Corporation detail, memberships and assets.`}
        actions={(
          <div className="flex items-center gap-2">
          <Link href="/admin/corporations" className="text-slate-600 hover:text-slate-300 transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <div className="w-11 h-11 rounded-sm bg-cyan-950 border border-cyan-800/40 flex items-center justify-center overflow-hidden shrink-0">
            {corp.logoUrl ? <img src={corp.logoUrl} alt={corp.tag} className="w-full h-full object-cover" /> : <Building2 size={18} className="text-cyan-400" />}
          </div>
            <Link href={`/admin/corporations?edit=${corp.id}`} className="sci-btn-primary py-1.5 px-3 text-xs">Edit metadata</Link>
          </div>
        )}
      />

      <StatGrid>
        <StatCard icon={Users} label="Members" value={members.length} />
        <StatCard icon={Ship} label="Fleet" value={fleetCount} accent="cyan" />
        <StatCard icon={Package} label="Bank Items" value={bankCount} accent="purple" />
        <StatCard icon={Check} label="Pending" value={pending.length} accent={pending.length ? 'amber' : 'slate'} />
      </StatGrid>

      <section className="sci-panel overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/50">
          <span className="text-[10px] font-mono-sc text-cyan-700 uppercase tracking-wider">Pending requests</span>
        </div>
        {pending.length === 0 ? (
          <p className="p-4 text-xs text-slate-600 font-mono-sc">No pending requests.</p>
        ) : (
          <div className="divide-y divide-border/30">
            {pending.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-rajdhani font-semibold text-slate-200 truncate">{m.user.username}</p>
                  <p className="text-[10px] text-slate-600 font-mono-sc truncate">{m.user.email}</p>
                </div>
                <button disabled={busy === m.id} onClick={() => approve(m.id)} className="sci-btn-primary py-1.5 px-3 text-xs">Approve</button>
                <button disabled={busy === m.id} onClick={() => approve(m.id, 'leader')} className="text-[10px] font-mono-sc text-emerald-400 border border-emerald-800/50 px-2 py-1 rounded-sm">Approve leader</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="sci-panel overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/50">
          <span className="text-[10px] font-mono-sc text-cyan-700 uppercase tracking-wider">Members</span>
        </div>
        <div className="divide-y divide-border/30">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-rajdhani font-semibold text-slate-200 truncate">{m.user.username}</p>
                <p className="text-[10px] text-slate-600 font-mono-sc truncate">{m.user.email}</p>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono-sc text-slate-500 uppercase">
                {m.role === 'leader' && <ShieldCheck size={11} className="text-emerald-400" />} {m.role}
              </span>
              <button
                disabled={busy === m.id}
                onClick={() => setRole(m.id, m.role === 'leader' ? 'member' : 'leader')}
                className="text-[10px] font-mono-sc text-slate-500 hover:text-emerald-400 border border-slate-800 px-2 py-1 rounded-sm"
              >
                {m.role === 'leader' ? 'Demote' : 'Make leader'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="sci-panel overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between">
          <span className="text-[10px] font-mono-sc text-cyan-700 uppercase tracking-wider">Assets</span>
          <span className="text-[10px] text-slate-600 font-mono-sc">{fleet.length} total</span>
        </div>
        <div className="divide-y divide-border/30">
          {fleet.slice(0, 80).map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-2">
              <span className="text-[10px] font-orbitron text-slate-500 uppercase w-20">{item.itemType}</span>
              <span className="text-xs font-mono-sc text-slate-300 truncate flex-1">{item.itemClassName}</span>
              <span className="text-[10px] text-slate-600 font-mono-sc">x{item.quantity}</span>
              <button
                type="button"
                disabled={busy === item.id}
                onClick={() => removeAsset(item.id)}
                className="p-1 text-slate-700 transition-colors hover:text-red-500 disabled:opacity-40"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
