'use client';

import { motion } from 'framer-motion';
import { Lock, LogIn, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') ?? '/';

  const [field, setField] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(field, password);
      router.push(redirect);
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-sm"
    >
      <div className="sci-panel p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-full bg-cyan-950 border border-cyan-700/40 flex items-center justify-center mx-auto mb-4">
            <Lock size={20} className="text-cyan-400" />
          </div>
          <h1 className="text-xl font-orbitron font-bold text-white tracking-wider">CONNEXION</h1>
          <p className="text-xs text-slate-500 font-mono-sc">STARVIS SECURE ACCESS</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">
              Email ou pseudonyme
            </label>
            <div className="relative">
              <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                type="text"
                value={field}
                onChange={(e) => setField(e.target.value)}
                placeholder="email@exemple.com ou pseudo"
                className="sci-input w-full pl-8"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">
              Mot de passe
            </label>
            <div className="relative">
              <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="sci-input w-full pl-8"
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 font-mono-sc bg-red-950/30 border border-red-800/30 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-cyan-900/40 border border-cyan-700/50 hover:border-cyan-500/70 hover:bg-cyan-900/60 text-cyan-300 font-mono-sc text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <LogIn size={15} />
            {loading ? 'CONNEXION...' : 'SE CONNECTER'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600">
          Pas encore de compte ?{' '}
          <Link href="/register" className="text-cyan-500 hover:text-cyan-300 transition-colors">
            Créer un compte
          </Link>
        </p>
      </div>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
