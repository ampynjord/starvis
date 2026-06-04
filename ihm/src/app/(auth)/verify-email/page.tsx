'use client';

import { motion } from 'framer-motion';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AuthPanel } from '@/components/ui/AuthPanel';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No verification token found in the URL.');
      return;
    }

    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setStatus('success');
          setTimeout(() => router.push('/'), 2000);
        } else {
          setStatus('error');
          setError(data.error ?? 'Verification failed.');
        }
      })
      .catch(() => {
        setStatus('error');
        setError('Network error. Please try again.');
      });
  }, [token, router]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-sm"
    >
      {status === 'loading' && (
        <AuthPanel icon={Loader2} title="Verifying..." className="text-center [&_svg]:animate-spin">
          <p className="text-xs text-slate-500 font-mono-sc">Please wait while we verify your email.</p>
        </AuthPanel>
      )}
      {status === 'success' && (
        <AuthPanel icon={CheckCircle} title="Email Verified" accent="green" className="text-center">
          <p className="text-sm text-slate-400 font-rajdhani">Your account is now active. Redirecting...</p>
        </AuthPanel>
      )}
      {status === 'error' && (
        <AuthPanel icon={XCircle} title="Verification Failed" accent="red" className="text-center">
          <p className="text-sm text-red-400 font-mono-sc">{error}</p>
          <Link href="/login" className="block text-xs text-cyan-500 hover:text-cyan-300 transition-colors">
            &larr; Back to login
          </Link>
        </AuthPanel>
      )}
    </motion.div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
