'use client';

import { Cookie } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { COOKIE_CONSENT_STORAGE_KEY, DEFAULT_AUTH_COOKIE_NAME } from '@/lib/app-constants';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const respond = (choice: 'accepted' | 'declined') => {
    try {
      localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, choice);
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-xl mx-auto">
      <div className="sci-panel border border-slate-700 bg-slate-950/95 backdrop-blur-sm p-4 shadow-xl">
        <div className="flex items-start gap-3 mb-3">
          <Cookie size={16} className="text-cyan-500 shrink-0 mt-0.5" />
          <p className="font-rajdhani text-sm text-slate-300 leading-snug">
            Starvis uses the strictly necessary authentication cookie{' '}
            <code className="font-mono-sc text-xs text-cyan-400">{DEFAULT_AUTH_COOKIE_NAME}</code>. No advertising or tracking cookies are
            used. Declining only hides this notice and does not disable login cookies.{' '}
            <Link href="/legal#cookies" className="text-cyan-500 hover:text-cyan-300 underline underline-offset-2">
              Learn more
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => respond('declined')}
            className="py-1 px-3 text-xs font-mono-sc text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-500 rounded-sm transition-colors"
          >
            DECLINE NOTICE
          </button>
          <button
            onClick={() => respond('accepted')}
            className="py-1 px-3 text-xs font-mono-sc text-cyan-300 bg-cyan-900/40 border border-cyan-700/50 hover:border-cyan-500/70 hover:bg-cyan-900/60 rounded-sm transition-colors"
          >
            ACCEPT
          </button>
        </div>
      </div>
    </div>
  );
}
