'use client';

import { useEffect } from 'react';
import { isStaleBuildError, reloadOnceForStaleBuild } from '@/lib/stale-build';

// Next.js App Router transitions and dynamic imports report chunk-load / Server Action
// mismatches as an `error` event or an unhandled rejection rather than a React render
// error, so ErrorBoundary alone never sees them. Catch both here and recover with a single
// reload instead of leaving the user on a page that quietly stops responding to clicks.
export function StaleBuildRecovery() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (isStaleBuildError(event.message) || isStaleBuildError(event.error?.message)) {
        reloadOnceForStaleBuild();
      }
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = typeof reason === 'string' ? reason : reason?.message;
      if (isStaleBuildError(message)) {
        reloadOnceForStaleBuild();
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
