'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, Code2, LogOut, QrCode, Save, Shield, ShieldCheck, ShieldOff, Trash2, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfilePage() {
  const { user, logout, refresh } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  // 2FA state
  const [twoFaSetup, setTwoFaSetup] = useState<{ secret: string; qrCodeUrl: string } | null>(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [twoFaMessage, setTwoFaMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setAvatarUrl(user.avatarUrl ?? '');
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username || undefined, avatarUrl: avatarUrl || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Update failed');
      await refresh();
      setMessage({ type: 'success', text: 'Profile updated' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/auth/me', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: (data as any).error ?? 'Deletion failed' });
        setShowDeleteModal(false);
        return;
      }
      await logout();
      router.push('/login');
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
      setShowDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleSetup2FA = async () => {
    setTwoFaLoading(true);
    setTwoFaMessage(null);
    try {
      const res = await fetch('/api/auth/2fa/setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Setup failed');
      setTwoFaSetup({ secret: data.secret, qrCodeUrl: data.qrCodeUrl });
      setTwoFaCode('');
    } catch (err: any) {
      setTwoFaMessage({ type: 'error', text: err.message });
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleEnable2FA = async () => {
    if (!twoFaCode) return;
    setTwoFaLoading(true);
    setTwoFaMessage(null);
    try {
      const res = await fetch('/api/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: twoFaCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Activation failed');
      setTwoFaSetup(null);
      setTwoFaCode('');
      setTwoFaMessage({ type: 'success', text: '2FA activated successfully.' });
      await refresh();
    } catch (err: any) {
      setTwoFaMessage({ type: 'error', text: err.message });
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!twoFaCode) return;
    setTwoFaLoading(true);
    setTwoFaMessage(null);
    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: twoFaCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Deactivation failed');
      setTwoFaCode('');
      setTwoFaMessage({ type: 'success', text: '2FA deactivated.' });
      await refresh();
    } catch (err: any) {
      setTwoFaMessage({ type: 'error', text: err.message });
    } finally {
      setTwoFaLoading(false);
    }
  };

  if (!user) return null;

  return (
    <PageShell size="lg" className="p-4 md:p-6">
      <PageHeader
        eyebrow="Account"
        title="My Profile"
        subtitle="Manage identity, API token and security."
        actions={(
          <div className="flex items-center gap-2 rounded-sm border border-cyan-900/50 bg-cyan-950/20 px-2.5 py-1.5">
            <User size={13} className="text-cyan-400" />
            <span className="font-mono-sc text-[10px] uppercase tracking-wider text-cyan-500">{user.role}</span>
          </div>
        )}
      />

      {/* Info card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="sci-panel p-5 space-y-4"
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-cyan-950 border border-cyan-700/40 flex items-center justify-center shrink-0 overflow-hidden">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
            ) : (
              <User size={24} className="text-cyan-400" />
            )}
          </div>
          <div>
            <p className="font-semibold text-white">{user.username}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Shield size={11} className="text-cyan-600" />
              <span className="text-xs font-mono-sc text-cyan-700 uppercase">{user.role}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Edit form */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="sci-panel p-5 space-y-5"
      >
        <h2 className="text-sm font-mono-sc text-cyan-700 uppercase tracking-wider">Edit profile</h2>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="sci-input w-full"
              minLength={3}
              maxLength={50}
              pattern="[a-zA-Z0-9_-]+"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">Avatar URL</label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              className="sci-input w-full"
            />
          </div>

          {message && (
            <p className={`text-xs font-mono-sc px-3 py-2 rounded border ${
              message.type === 'success'
                ? 'text-green-400 bg-green-950/30 border-green-800/30'
                : 'text-red-400 bg-red-950/30 border-red-800/30'
            }`}>
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 py-2 px-4 bg-cyan-900/40 border border-cyan-700/50 hover:border-cyan-500/70 hover:bg-cyan-900/60 text-cyan-300 font-mono-sc text-sm rounded transition-colors disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? 'SAVING...' : 'SAVE'}
          </button>
        </form>
      </motion.div>

      {/* Developer API */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="sci-panel p-5 space-y-4"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-mono-sc text-cyan-700 uppercase tracking-wider">Developer API</h2>
            <span className="text-[9px] font-orbitron font-bold tracking-widest text-violet-400 bg-violet-950/40 border border-violet-700/50 px-1.5 py-0.5 rounded-sm">
              DEV
            </span>
          </div>
          <p className="text-xs text-slate-600">Swagger access and external API tokens are now managed from the developer console.</p>
        </div>

        <Link
          href="/developer"
          className="inline-flex items-center gap-2 py-2 px-4 bg-cyan-900/40 border border-cyan-700/50 hover:border-cyan-500/70 hover:bg-cyan-900/60 text-cyan-300 font-mono-sc text-sm rounded transition-colors"
        >
          <Code2 size={14} />
          Open API Access
        </Link>
      </motion.div>

      {/* 2FA */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="sci-panel p-5 space-y-4"
      >
        <div className="space-y-1">
          <h2 className="text-sm font-mono-sc text-cyan-700 uppercase tracking-wider">Two-factor authentication</h2>
          <p className="text-xs text-slate-600">Add an extra layer of security with a TOTP authenticator app.</p>
        </div>

        {twoFaMessage && (
          <p className={`text-xs font-mono-sc px-3 py-2 rounded border ${
            twoFaMessage.type === 'success'
              ? 'text-green-400 bg-green-950/30 border-green-800/30'
              : 'text-red-400 bg-red-950/30 border-red-800/30'
          }`}>
            {twoFaMessage.text}
          </p>
        )}

        {(user as any).twoFactorEnabled ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-400 text-xs font-mono-sc">
              <ShieldCheck size={14} />
              2FA is active
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono-sc text-slate-500 uppercase tracking-wider">TOTP code to disable</label>
              <input
                type="text"
                value={twoFaCode}
                onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="sci-input w-32 text-center font-mono tracking-widest"
              />
            </div>
            <button
              onClick={handleDisable2FA}
              disabled={twoFaLoading || twoFaCode.length !== 6}
              className="flex items-center gap-2 py-2 px-4 border border-red-800/50 hover:border-red-600/70 bg-red-950/20 hover:bg-red-950/40 text-red-400 font-mono-sc text-sm rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ShieldOff size={14} />
              {twoFaLoading ? 'DISABLING...' : 'DISABLE 2FA'}
            </button>
          </div>
        ) : twoFaSetup ? (
          <div className="space-y-4">
            <p className="text-xs text-slate-400">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.).</p>
            <img src={twoFaSetup.qrCodeUrl} alt="2FA QR Code" className="w-40 h-40 bg-white p-2 rounded" />
            <p className="text-xs text-slate-500">Or enter this secret manually: <code className="text-cyan-400 font-mono">{twoFaSetup.secret}</code></p>
            <div className="space-y-2">
              <label className="text-xs font-mono-sc text-slate-500 uppercase tracking-wider">Enter the 6-digit code to confirm</label>
              <input
                type="text"
                value={twoFaCode}
                onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="sci-input w-32 text-center font-mono tracking-widest"
              />
            </div>
            <button
              onClick={handleEnable2FA}
              disabled={twoFaLoading || twoFaCode.length !== 6}
              className="flex items-center gap-2 py-2 px-4 bg-cyan-900/40 border border-cyan-700/50 hover:border-cyan-500/70 hover:bg-cyan-900/60 text-cyan-300 font-mono-sc text-sm rounded transition-colors disabled:opacity-50"
            >
              <ShieldCheck size={14} />
              {twoFaLoading ? 'VERIFYING...' : 'ACTIVATE 2FA'}
            </button>
          </div>
        ) : (
          <button
            onClick={handleSetup2FA}
            disabled={twoFaLoading}
            className="flex items-center gap-2 py-2 px-4 bg-cyan-900/40 border border-cyan-700/50 hover:border-cyan-500/70 hover:bg-cyan-900/60 text-cyan-300 font-mono-sc text-sm rounded transition-colors disabled:opacity-50"
          >
            <QrCode size={14} />
            {twoFaLoading ? 'LOADING...' : 'SET UP 2FA'}
          </button>
        )}
      </motion.div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="flex items-center gap-2 py-2 px-4 border border-red-800/40 hover:border-red-600/60 text-red-500 hover:text-red-400 font-mono-sc text-sm rounded transition-colors"
      >
        <LogOut size={14} />
        SIGN OUT
      </button>

      {/* Danger zone — GDPR right to erasure */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="sci-panel p-5 space-y-4 border-red-900/40"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-500 shrink-0" />
          <h2 className="text-sm font-mono-sc text-red-500 uppercase tracking-wider">Danger zone</h2>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Account deletion is irreversible. All your personal data (email, username, avatar)
          will be permanently erased, in accordance with your right to erasure (GDPR art. 17).
        </p>
        <button
          onClick={() => { setDeleteConfirm(''); setShowDeleteModal(true); }}
          className="flex items-center gap-2 py-2 px-4 border border-red-800/50 hover:border-red-600/70 bg-red-950/20 hover:bg-red-950/40 text-red-500 hover:text-red-400 font-mono-sc text-sm rounded transition-colors"
        >
          <Trash2 size={14} />
          DELETE MY ACCOUNT
        </button>
      </motion.div>

      {/* Modal de confirmation de suppression */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="sci-panel p-6 max-w-sm w-full space-y-4"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-400 shrink-0" />
              <h3 className="font-orbitron text-sm font-bold text-red-400 uppercase tracking-wider">
                Confirm deletion
              </h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              This action is <span className="text-red-400 font-semibold">irreversible</span>. Your account and all
              your data will be permanently deleted.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-mono-sc text-slate-500 uppercase tracking-wider">
                Type <span className="text-red-400">{user.username}</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={user.username}
                className="sci-input w-full"
                autoComplete="off"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2 px-4 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-200 font-mono-sc text-sm rounded transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== user.username || deleting}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-red-900/40 border border-red-700/50 hover:border-red-500/70 hover:bg-red-900/60 text-red-400 font-mono-sc text-sm rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 size={13} />
                {deleting ? 'DELETING...' : 'DELETE'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </PageShell>
  );
}
