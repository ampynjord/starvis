import type { ReactNode } from 'react';

interface PageShellProps {
  children: ReactNode;
  className?: string;
  size?: 'lg' | 'xl' | '2xl' | 'full';
}

const SIZE_CLASS: Record<NonNullable<PageShellProps['size']>, string> = {
  lg: 'max-w-5xl',
  xl: 'max-w-6xl',
  '2xl': 'max-w-(--breakpoint-2xl)',
  full: 'max-w-none',
};

export function PageShell({ children, className = '', size = '2xl' }: PageShellProps) {
  return (
    <div className={`${SIZE_CLASS[size]} mx-auto w-full min-w-0 space-y-4 ${className}`}>
      {children}
    </div>
  );
}
