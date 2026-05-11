'use client';

import { Cookie, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'starvis_cookie_consent';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'accepted');
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-xl mx-auto">
      <div className="sci-panel border border-slate-700 bg-slate-950/95 backdrop-blur-sm p-4 flex items-start gap-3 shadow-xl">
        <Cookie size={16} className="text-cyan-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-rajdhani text-sm text-slate-300 leading-snug">
            Starvis uses a single session cookie (<code className="font-mono-sc text-xs text-cyan-400">starvis_token</code>)
            strictly necessary for authentication. No advertising or tracking cookies are used.{' '}
            <Link href="/legal#cookies" className="text-cyan-500 hover:text-cyan-300 underline underline-offset-2">
              Learn more
            </Link>
          </p>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
