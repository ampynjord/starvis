'use client';

import { motion } from 'framer-motion';
import { Lock, LogIn, ShieldCheck, User, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthPanel } from '@/components/ui/AuthPanel';
import { useAuth } from '@/contexts/AuthContext';

function LoginForm() {
  const { login, verify2FA } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') ?? '/';
  const redirectedToProtectedFeature = redirect !== '/';

  const [step, setStep] = useState<'credentials' | '2fa'>('credentials');
  const [field, setField] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [pendingToken, setPendingToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(field, password);
      if (result?.requires2FA) {
        setPendingToken(result.pendingToken);
        setStep('2fa');
      } else {
        router.push(redirect);
      }
    } catch (err: any) {
      if (err.message === 'EMAIL_NOT_VERIFIED') {
        setError('Your email address has not been verified. Please check your inbox and click the verification link.');
      } else {
        setError(err.message ?? 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verify2FA(pendingToken, totpCode);
      router.push(redirect);
    } catch (err: any) {
      setError(err.message ?? '2FA verification failed');
    } finally {
      setLoading(false);
    }
  };

  if (step === '2fa') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm"
      >
        <AuthPanel icon={ShieldCheck} title="2FA Required" subtitle="Enter your authenticator code">

          <form onSubmit={handle2FASubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">6-digit code</label>
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="sci-input w-full text-center font-mono text-xl tracking-widest"
                autoFocus
                required
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 font-mono-sc bg-red-950/30 border border-red-800/30 rounded px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-cyan-900/40 border border-cyan-700/50 hover:border-cyan-500/70 hover:bg-cyan-900/60 text-cyan-300 font-mono-sc text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShieldCheck size={15} />
              {loading ? 'VERIFYING...' : 'VERIFY'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('credentials'); setError(''); setTotpCode(''); }}
              className="w-full text-xs text-slate-600 hover:text-slate-400 transition-colors font-mono-sc"
            >
              &larr; Back to login
            </button>
          </form>
        </AuthPanel>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-sm"
    >
      <AuthPanel icon={Lock} title="Sign In" subtitle="Starvis secure access">
        {redirectedToProtectedFeature && (
          <div className="rounded-sm border border-cyan-900/40 bg-cyan-950/20 px-3 py-2 text-xs leading-relaxed text-slate-400">
            This feature is available after sign-in. Create a free account to unlock profile tools,
            corporation features, bug reports, API access and the Starvis AI assistant.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">
              Email or username
            </label>
            <div className="relative">
              <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                type="text"
                value={field}
                onChange={(e) => setField(e.target.value)}
                placeholder="email@example.com or username"
                className="sci-input w-full pl-8"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-[10px] font-mono-sc text-slate-500 hover:text-cyan-400 transition-colors"
              >
                Forgot password?
              </Link>
            </div>
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
            {loading ? 'SIGNING IN...' : 'SIGN IN'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600">
          No account yet?{' '}
          <Link
            href="/register"
            className="inline-flex items-center gap-1 text-cyan-500 hover:text-cyan-300 transition-colors"
          >
            <UserPlus size={11} />
            Create an account
          </Link>
        </p>
      </AuthPanel>
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
