'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, Copy, Key, LogOut, Save, Shield, Trash2, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfilePage() {
  const { user, logout, refresh } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

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
      setMessage({ type: 'success', text: 'Profil mis à jour' });
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
        setMessage({ type: 'error', text: (data as any).error ?? 'Échec de la suppression' });
        setShowDeleteModal(false);
        return;
      }
      await logout();
      router.push('/login');
    } catch {
      setMessage({ type: 'error', text: 'Erreur réseau' });
      setShowDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleGenerateApiToken = async () => {
    setGeneratingToken(true);
    setApiToken(null);
    try {
      const res = await fetch('/api/auth/api-token', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setApiToken(data.token);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setGeneratingToken(false);
    }
  };

  const handleCopyToken = () => {
    if (!apiToken) return;
    navigator.clipboard.writeText(apiToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  if (!user) return null;

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <User size={20} className="text-cyan-400" />
        <h1 className="text-lg font-orbitron font-bold text-white tracking-wider">MON PROFIL</h1>
      </div>

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
        <h2 className="text-sm font-mono-sc text-cyan-700 uppercase tracking-wider">Modifier le profil</h2>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">Pseudonyme</label>
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
            <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">URL Avatar</label>
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
            {saving ? 'SAUVEGARDE...' : 'SAUVEGARDER'}
          </button>
        </form>
      </motion.div>

      {/* API Token */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="sci-panel p-5 space-y-4"
      >
        <div className="space-y-1">
          <h2 className="text-sm font-mono-sc text-cyan-700 uppercase tracking-wider">Token API externe</h2>
          <p className="text-xs text-slate-600">Génère un token longue durée (1 an) pour accéder à l'API depuis des projets externes.</p>
        </div>

        {apiToken ? (
          <div className="space-y-2">
            <p className="text-xs text-amber-400 font-mono-sc">Copiez ce token maintenant — il ne sera plus affiché.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[10px] font-mono text-slate-300 bg-slate-900 border border-slate-700 rounded px-3 py-2 truncate">
                {apiToken}
              </code>
              <button
                onClick={handleCopyToken}
                className="shrink-0 p-2 rounded border border-slate-700 hover:border-cyan-700/50 hover:bg-white/5 transition-colors"
                title="Copier"
              >
                <Copy size={14} className={tokenCopied ? 'text-green-400' : 'text-slate-400'} />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleGenerateApiToken}
            disabled={generatingToken}
            className="flex items-center gap-2 py-2 px-4 bg-cyan-900/40 border border-cyan-700/50 hover:border-cyan-500/70 hover:bg-cyan-900/60 text-cyan-300 font-mono-sc text-sm rounded transition-colors disabled:opacity-50"
          >
            <Key size={14} />
            {generatingToken ? 'GÉNÉRATION...' : 'GÉNÉRER UN TOKEN API'}
          </button>
        )}
      </motion.div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="flex items-center gap-2 py-2 px-4 border border-red-800/40 hover:border-red-600/60 text-red-500 hover:text-red-400 font-mono-sc text-sm rounded transition-colors"
      >
        <LogOut size={14} />
        SE DÉCONNECTER
      </button>

      {/* Danger zone — RGPD droit à l'effacement */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="sci-panel p-5 space-y-4 border-red-900/40"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-500 shrink-0" />
          <h2 className="text-sm font-mono-sc text-red-500 uppercase tracking-wider">Zone de danger</h2>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          La suppression de votre compte est irréversible. Toutes vos données personnelles (e-mail, pseudonyme, avatar)
          seront définitivement effacées, conformément à votre droit à l'effacement (RGPD art. 17).
        </p>
        <button
          onClick={() => { setDeleteConfirm(''); setShowDeleteModal(true); }}
          className="flex items-center gap-2 py-2 px-4 border border-red-800/50 hover:border-red-600/70 bg-red-950/20 hover:bg-red-950/40 text-red-500 hover:text-red-400 font-mono-sc text-sm rounded transition-colors"
        >
          <Trash2 size={14} />
          SUPPRIMER MON COMPTE
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
                Confirmer la suppression
              </h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Cette action est <span className="text-red-400 font-semibold">irréversible</span>. Votre compte et toutes
              vos données seront définitivement supprimés.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-mono-sc text-slate-500 uppercase tracking-wider">
                Tapez <span className="text-red-400">{user.username}</span> pour confirmer
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
                ANNULER
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== user.username || deleting}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-red-900/40 border border-red-700/50 hover:border-red-500/70 hover:bg-red-900/60 text-red-400 font-mono-sc text-sm rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 size={13} />
                {deleting ? 'SUPPRESSION...' : 'SUPPRIMER'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
