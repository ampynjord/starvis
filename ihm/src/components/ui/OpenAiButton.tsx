'use client';

import type { ReactNode } from 'react';

export function OpenAiButton({ prompt, children, className }: { prompt: string; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        window.dispatchEvent(new CustomEvent('starvis:open-ai', { detail: { prompt } }));
      }}
    >
      {children}
    </button>
  );
}
