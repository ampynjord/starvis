'use client';

export const dynamic = 'force-dynamic';

import { motion } from 'framer-motion';
import { Shield, UserCheck, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { AuthUser } from '@/contexts/AuthContext';

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (user?.role !== 'admin') return;
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((d) => setUsers(d.data ?? []))
      .finally(() => setLoading(false));
  }, [user]);

  const toggleRole = async (target: AuthUser) => {
    const newRole = target.role === 'admin' ? 'user' : 'admin';
    setUpdating(target.id);
    try {
      const res = await fetch(`/api/admin/users/${target.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, role: newRole } : u)));
        setMessage(`${target.username} → ${newRole}`);
        setTimeout(() => setMessage(''), 3000);
      }
    } finally {
      setUpdating(null);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-6 text-center text-slate-500 font-mono-sc text-sm">
        ACCÈS REFUSÉ — Rôle admin requis
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield size={20} className="text-cyan-400" />
        <h1 className="text-lg font-orbitron font-bold text-white tracking-wider">ADMINISTRATION</h1>
      </div>

      {message && (
        <p className="text-xs text-green-400 font-mono-sc bg-green-950/30 border border-green-800/30 rounded px-3 py-2">
          {message}
        </p>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="sci-panel overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
          <span className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">Utilisateurs</span>
          <span className="text-xs text-slate-600">{users.length} comptes</span>
        </div>

        {loading ? (
          <div className="p-6 text-center text-slate-600 text-sm font-mono-sc">Chargement…</div>
        ) : (
          <div className="divide-y divide-border/30">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-cyan-950 border border-cyan-700/30 flex items-center justify-center shrink-0 overflow-hidden">
                    {u.avatarUrl
                      ? <img src={u.avatarUrl} alt={u.username} className="w-full h-full object-cover" />
                      : <span className="text-xs text-cyan-400 font-orbitron">{u.username[0].toUpperCase()}</span>
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-200 truncate">{u.username}</p>
                    <p className="text-xs text-slate-600 truncate">{u.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-mono-sc px-2 py-0.5 rounded border ${
                    u.role === 'admin'
                      ? 'text-cyan-400 border-cyan-700/50 bg-cyan-950/40'
                      : 'text-slate-500 border-slate-700/50'
                  }`}>
                    {u.role.toUpperCase()}
                  </span>

                  {u.id !== user.id && (
                    <button
                      onClick={() => toggleRole(u)}
                      disabled={updating === u.id}
                      title={u.role === 'admin' ? 'Rétrograder en user' : 'Promouvoir en admin'}
                      className="p-1.5 rounded border border-transparent hover:border-slate-700/50 hover:bg-white/5 transition-colors disabled:opacity-40"
                    >
                      {u.role === 'admin'
                        ? <UserX size={14} className="text-red-500" />
                        : <UserCheck size={14} className="text-green-500" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
