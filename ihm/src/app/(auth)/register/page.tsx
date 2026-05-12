'use client';

import { motion } from 'framer-motion';
import { CheckCircle, Lock, Mail, UserPlus, User, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

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

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [consented, setConsented] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);

  const passwordsMatch = confirm === '' || password === confirm;
  const strongEnough = isStrongPassword(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!strongEnough) {
      setError('The password does not meet the security requirements.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (!consented) {
      setError('You must accept the privacy policy to create an account.');
      return;
    }

    setLoading(true);
    try {
      const result = await register(email, username, password);
      if (result?.requiresVerification) {
        setVerificationPending(true);
      } else {
        router.push('/');
      }
    } catch (err: any) {
      setError(err.message ?? 'Account creation failed');
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
      {verificationPending ? (
        <div className="sci-panel p-8 space-y-4 text-center">
          <div className="w-12 h-12 rounded-full bg-green-950 border border-green-700/40 flex items-center justify-center mx-auto">
            <CheckCircle size={20} className="text-green-400" />
          </div>
          <h1 className="text-lg font-orbitron font-bold text-white tracking-wider">CHECK YOUR EMAIL</h1>
          <p className="text-sm text-slate-400 font-rajdhani leading-relaxed">
            We sent a verification link to <span className="text-cyan-400">{email}</span>.
            Click the link in the email to activate your account.
          </p>
          <p className="text-xs text-slate-600">The link is valid for 48 hours.</p>
          <Link href="/login" className="block text-xs text-cyan-500 hover:text-cyan-300 transition-colors mt-2">
            Already verified? Sign in &rarr;
          </Link>
        </div>
      ) : (
      <div className="sci-panel p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-full bg-cyan-950 border border-cyan-700/40 flex items-center justify-center mx-auto mb-4">
            <UserPlus size={20} className="text-cyan-400" />
          </div>
          <h1 className="text-xl font-orbitron font-bold text-white tracking-wider">REGISTER</h1>
          <p className="text-xs text-slate-500 font-mono-sc">CREATE A STARVIS ACCOUNT</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">Email</label>

            <div className="relative">
              <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemple.com"
                className="sci-input w-full pl-8"
                autoComplete="email"
                required
              />
            </div>
          </div>

          {/* Pseudo */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">Username</label>
            <div className="relative">
              <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="VotrePseudo"
                className="sci-input w-full pl-8"
                autoComplete="username"
                required
                minLength={3}
                maxLength={50}
                pattern="[a-zA-Z0-9_-]+"
              />
            </div>
            <p className="text-xs text-slate-600">3-50 characters, letters/digits/_ only</p>
          </div>

          {/* Mot de passe */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">Password</label>
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

            {/* Rules indicator */}
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

          {/* Confirmation */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">Confirm password</label>
            <div className="relative">
              <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className={`sci-input w-full pl-8 ${
                  confirm.length > 0 && !passwordsMatch ? 'border-red-700/60' : ''
                }`}
                autoComplete="new-password"
                required
              />
            </div>
            {confirm.length > 0 && !passwordsMatch && (
              <p className="text-xs text-red-400">Passwords do not match</p>
            )}
          </div>

          {/* RGPD — consentement */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-0.5 accent-cyan-500 shrink-0"
            />
            <span className="text-xs text-slate-400 leading-relaxed">
              I have read and accept the{' '}
              <Link
                href="/legal"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-500 hover:text-cyan-300 underline underline-offset-2"
              >
                privacy policy
              </Link>{' '}
              and consent to the processing of my personal data (email, username) for access to the service.
            </span>
          </label>

          {error && (
            <p className="text-xs text-red-400 font-mono-sc bg-red-950/30 border border-red-800/30 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !strongEnough || !passwordsMatch || confirm.length === 0 || !consented}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-cyan-900/40 border border-cyan-700/50 hover:border-cyan-500/70 hover:bg-cyan-900/60 text-cyan-300 font-mono-sc text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserPlus size={15} />
            {loading ? 'CREATING...' : 'CREATE ACCOUNT'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600">
          Already have an account?{' '}
          <Link href="/login" className="text-cyan-500 hover:text-cyan-300 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
      )}
    </motion.div>
  );
}
