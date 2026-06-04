'use client';

import { motion } from 'framer-motion';
import { CheckCircle, Lock, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthPanel } from '@/components/ui/AuthPanel';

interface PasswordRule {
  label: string;
  test: (p: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'At least 8 characters',        test: (p) => p.length >= 8 },
  { label: 'One uppercase letter',          test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter',          test: (p) => /[a-z]/.test(p) },
  { label: 'One digit',                     test: (p) => /[0-9]/.test(p) },
  { label: 'One special character (!@#…)',  test: (p) => /[^a-zA-Z0-9]/.test(p) },
];

function isStrongPassword(p: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(p));
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showRules, setShowRules] = useState(false);

  const strongEnough = isStrongPassword(password);
  const passwordsMatch = confirm === '' || password === confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!strongEnough || password !== confirm) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Reset failed');
        return;
      }
      setSuccess(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthPanel icon={XCircle} title="Invalid Link" accent="red" className="text-center">
        <p className="text-sm text-red-400 font-mono-sc">No reset token found in the URL.</p>
        <Link href="/forgot-password" className="block text-xs text-cyan-500 hover:text-cyan-300 transition-colors">
          Request a new reset link &rarr;
        </Link>
      </AuthPanel>
    );
  }

  if (success) {
    return (
      <AuthPanel icon={CheckCircle} title="Password Reset" accent="green" className="text-center">
        <p className="text-sm text-slate-400 font-rajdhani">Your password has been updated successfully.</p>
        <Link href="/login" className="block text-xs text-cyan-500 hover:text-cyan-300 transition-colors">
          Sign in with your new password &rarr;
        </Link>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel icon={Lock} title="Reset Password" subtitle="Choose a new password">

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">New password</label>
          <div className="relative">
            <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setShowRules(true)}
              placeholder="••••••••"
              className="sci-input w-full pl-8"
              autoComplete="new-password"
              required
            />
          </div>
          {showRules && password.length > 0 && (
            <ul className="space-y-1 mt-1">
              {PASSWORD_RULES.map((rule) => {
                const ok = rule.test(password);
                return (
                  <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-green-500' : 'text-slate-500'}`}>
                    {ok
                      ? <CheckCircle size={11} className="shrink-0" />
                      : <XCircle size={11} className="shrink-0 text-slate-600" />}
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">Confirm password</label>
          <div className="relative">
            <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className={`sci-input w-full pl-8 ${confirm.length > 0 && !passwordsMatch ? 'border-red-700/60' : ''}`}
              autoComplete="new-password"
              required
            />
          </div>
          {confirm.length > 0 && !passwordsMatch && (
            <p className="text-xs text-red-400">Passwords do not match</p>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-400 font-mono-sc bg-red-950/30 border border-red-800/30 rounded px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !strongEnough || !passwordsMatch || confirm.length === 0}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-cyan-900/40 border border-cyan-700/50 hover:border-cyan-500/70 hover:bg-cyan-900/60 text-cyan-300 font-mono-sc text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Lock size={15} />
          {loading ? 'RESETTING...' : 'RESET PASSWORD'}
        </button>
      </form>
    </AuthPanel>
  );
}

export default function ResetPasswordPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-sm"
    >
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </motion.div>
  );
}
