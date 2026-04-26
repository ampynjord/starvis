import type { ReactNode } from 'react';

interface Props {
  sidebar?: ReactNode;
  children: ReactNode;
  maxWidth?: 'xl' | '2xl' | '7xl';
  sidebarWidth?: 'w-44' | 'w-56';
}

/**
 * Standard two-column page layout: optional FilterPanel sidebar (w-44) + flex-1 content.
 * Used consistently on Ships, Components, Items, Commodities, Missions, etc.
 */
export function PageLayout({
  sidebar,
  children,
  maxWidth = '2xl',
  sidebarWidth = 'w-44',
}: Props) {
  const maxClass = maxWidth === '2xl'
    ? 'max-w-(--breakpoint-2xl)'
    : maxWidth === 'xl'
    ? 'max-w-(--breakpoint-xl)'
    : 'max-w-7xl';

  if (!sidebar) {
    return (
      <div className={`${maxClass} mx-auto`}>
        {children}
      </div>
    );
  }

  return (
    <div className={`${maxClass} mx-auto`}>
      <div className="flex gap-4">
        <div className={`${sidebarWidth} shrink-0`}>{sidebar}</div>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
