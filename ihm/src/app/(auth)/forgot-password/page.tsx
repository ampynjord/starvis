'use client';

import { motion } from 'framer-motion';
import { CheckCircle, Mail, Send } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AuthPanel } from '@/components/ui/AuthPanel';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Request failed');
        return;
      }
      setSubmitted(true);
    } catch {
      setError('Network error. Please try again.');
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
      <AuthPanel
        icon={submitted ? CheckCircle : Mail}
        title={submitted ? 'Check Your Email' : 'Forgot Password'}
        subtitle={submitted ? undefined : "We'll send you a reset link"}
        accent={submitted ? 'green' : 'cyan'}
      >
        {submitted ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-slate-400 font-rajdhani leading-relaxed">
              If an account with <span className="text-cyan-400">{email}</span> exists, we sent a password reset link.
            </p>
            <p className="text-xs text-slate-600">The link is valid for 1 hour.</p>
            <Link href="/login" className="block text-xs text-cyan-500 hover:text-cyan-300 transition-colors mt-2">
              &larr; Back to login
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider">Email address</label>
                <div className="relative">
                  <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="sci-input w-full pl-8"
                    autoComplete="email"
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
                <Send size={15} />
                {loading ? 'SENDING...' : 'SEND RESET LINK'}
              </button>
            </form>

            <p className="text-center text-xs text-slate-600">
              <Link href="/login" className="text-cyan-500 hover:text-cyan-300 transition-colors">
                &larr; Back to login
              </Link>
            </p>
          </>
        )}
      </AuthPanel>
    </motion.div>
  );
}
