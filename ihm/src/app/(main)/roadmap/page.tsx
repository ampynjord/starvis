import type { Metadata } from 'next';
import Link from 'next/link';
import { Bot, BrainCircuit, CheckCircle2, Code2, Database, FlaskConical, Rocket, ShieldAlert, Wrench } from 'lucide-react';
import { EarlyAccessNotice } from '@/components/ui/EarlyAccessNotice';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';

export const metadata: Metadata = {
  title: 'Starvis Roadmap',
  description: 'Current Starvis roadmap: stable areas, early-access features, validation work and planned platform improvements.',
};

const LANES = [
  {
    title: 'Stable core',
    icon: CheckCircle2,
    color: 'text-emerald-300',
    dot: 'bg-emerald-400',
    border: 'border-emerald-900/50',
    items: [
      'Public database browsing for ships, components, items, commodities, missions, manufacturers, lore and locations.',
      'Authenticated external API access with Swagger, API tokens and admin supervision.',
      'Discord bot command map connected to the Starvis API and data status.',
    ],
  },
  {
    title: 'Early access',
    icon: FlaskConical,
    color: 'text-amber-300',
    dot: 'bg-amber-400',
    border: 'border-amber-900/50',
    items: [
      'Calculators for trade, mining, crafting and FPS values while extraction and validation continue.',
      'Fleet manager, corporation bank and tactics workflows.',
      'Starvis AI assistant across the web app, Discord and external API guidance.',
    ],
  },
  {
    title: 'Validation focus',
    icon: ShieldAlert,
    color: 'text-red-300',
    dot: 'bg-red-400',
    border: 'border-red-900/50',
    items: [
      'Shop locations are extracted, but shop inventory is disabled until a reliable source is available.',
      'Economy and calculator outputs need stronger confidence labels, source metadata and real data audits.',
      'Starmap and universe data need continued position, hierarchy and visual validation against extracted data.',
    ],
  },
  {
    title: 'Next platform work',
    icon: Rocket,
    color: 'text-cyan-300',
    dot: 'bg-cyan-400',
    border: 'border-cyan-900/50',
    items: [
      'Deeper AI tool-use, page-aware context and confidence-aware answers.',
      'More external API examples, SDK-style snippets and project onboarding.',
      'Better quality audit dashboards for real user flows, API usage and data freshness.',
    ],
  },
];

const AREAS = [
  { href: '/about', icon: Database, label: 'Platform overview' },
  { href: '/ai', icon: BrainCircuit, label: 'AI assistant' },
  { href: '/developer', icon: Code2, label: 'External API' },
  { href: '/discord', icon: Bot, label: 'Discord bot' },
  { href: '/report-bug', icon: Wrench, label: 'Report issue' },
];

export default function RoadmapPage() {
  return (
    <PageShell size="xl" className="p-4 md:p-6">
      <PageHeader
        eyebrow="Platform"
        title="Roadmap"
        subtitle="What is solid, what is early access, and what Starvis is improving next."
        actions={(
          <div className="flex flex-wrap gap-2">
            {AREAS.map(({ href, icon: Icon, label }) => (
              <Link key={href} href={href} className="sci-btn-ghost px-3 py-2 text-xs">
                <Icon size={13} />
                {label}
              </Link>
            ))}
          </div>
        )}
      />

      <EarlyAccessNotice className="mb-4">
        This roadmap describes the current development direction. Starvis remains an unofficial active-development project, and data quality can vary by feature area.
      </EarlyAccessNotice>

      <section className="grid gap-4 md:grid-cols-2">
        {LANES.map(({ title, icon: Icon, color, dot, border, items }) => (
          <article key={title} className={`sci-panel border ${border} p-5`}>
            <div className="mb-4 flex items-center gap-2 border-b border-slate-800/70 pb-3">
              <Icon size={16} className={color} />
              <h2 className="font-orbitron text-[10px] font-bold uppercase tracking-widest text-slate-300">{title}</h2>
            </div>
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item} className="flex gap-2 font-rajdhani text-sm leading-relaxed text-slate-500">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="sci-panel p-5">
        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <p className="font-orbitron text-[10px] font-bold uppercase tracking-widest text-cyan-400">No partner page yet</p>
            <p className="mt-2 font-mono-sc text-[10px] leading-relaxed text-slate-600">
              Starvis can be presented to other projects, but partnership content will wait until there is a real partnership to announce.
            </p>
          </div>
          <p className="font-rajdhani text-sm leading-relaxed text-slate-400">
            The priority is to make the existing product credible: clearer data confidence, stronger API and AI presentation, fewer manual data assumptions, and a cleaner navigation path for players,
            organizations and external developers.
          </p>
        </div>
      </section>
    </PageShell>
  );
}
