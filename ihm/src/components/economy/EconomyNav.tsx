'use client';

import { Boxes, Factory, Route, Scale } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/trade', label: 'Routes', icon: Route },
  { href: '/trade-calculator', label: 'Calculator', icon: Scale },
  { href: '/commodities', label: 'Commodities', icon: Boxes },
  { href: '/industrial', label: 'Industries', icon: Factory },
];

export function EconomyNav() {
  const pathname = usePathname();

  return (
    <div className="mb-4 rounded-sm border border-slate-800/70 bg-slate-950/40 p-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid grid-cols-2 gap-1 sm:flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={[
                  'inline-flex items-center justify-center gap-1.5 rounded-sm border px-3 py-2 font-mono-sc text-[10px] uppercase tracking-widest transition-colors',
                  active
                    ? 'border-cyan-700 bg-cyan-950/35 text-cyan-300'
                    : 'border-slate-800/80 text-slate-500 hover:border-cyan-900/70 hover:text-cyan-400',
                ].join(' ')}
              >
                <Icon size={12} />
                {tab.label}
              </Link>
            );
          })}
        </div>
        <p className="font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">
          Market source: UEX snapshot, with local fallback when unavailable
        </p>
      </div>
    </div>
  );
}
