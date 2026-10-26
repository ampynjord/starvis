import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Code2, Database, FlaskConical, GitBranch, Rocket, ShieldAlert, Wrench } from 'lucide-react';
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
      'Public REST API v1 (/api/v1/*) with Swagger UI (/api-docs) and optional high-throughput Bearer tokens.',
      'Official RSI website scraping (Ship Matrix, Galactapedia, Comm-Links Alexandria, ARK Starmap) cross-referenced with Data.p4k.',
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
      'Bilingual EN/FR localization and historical patch snapshots (?version=4.x.x).',
      'Pre-computed Bulk JSON Data Packs (/api/v1/datasets) for desktop apps and overlays.',
    ],
  },
  {
    title: 'Validation focus',
    icon: ShieldAlert,
    color: 'text-red-300',
    dot: 'bg-red-400',
    border: 'border-red-900/50',
    items: [
      'Economy and calculator outputs need stronger confidence labels, source metadata and real data audits.',
      'Location and universe data need continued position, hierarchy and validation against extracted game data.',
      'Cross-referencing UEX 2.0 terminals and refinery yields with internal DataForge location UUIDs.',
    ],
  },
  {
    title: 'Next platform work',
    icon: Rocket,
    color: 'text-cyan-300',
    dot: 'bg-cyan-400',
    border: 'border-cyan-900/50',
    items: [
      'Extended RSI scraping: Roadmap Release View, Loaner Ship Matrix, Storefront MSRP and Organization lookups.',
      'More external API examples, SDK-style snippets and bulk dataset feeds for community projects.',
      'Automated patch extraction and diffing across LIVE and PTU builds.',
    ],
  },
];

const AREAS = [
  { href: '/about', icon: Database, label: 'Platform overview' },
  { href: '/developer', icon: Code2, label: 'API & Datasets' },
  { href: '/changelog', icon: GitBranch, label: 'Patch History' },
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
