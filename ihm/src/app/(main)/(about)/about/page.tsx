import type { Metadata } from 'next';
import Link from 'next/link';
import { Code2, Database, ExternalLink, GitBranch, Globe, Layers, ShieldCheck, Wrench } from 'lucide-react';
import { EarlyAccessNotice } from '@/components/ui/EarlyAccessNotice';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';

export const metadata: Metadata = {
  title: 'About Starvis',
  description:
    'Starvis is an Open Star Citizen Database, Multi-Source Data Engine & Public API cross-referencing Data.p4k, official RSI website data, UEX Corp 2.0 and bilingual EN/FR localization.',
};

const PLATFORM_LINKS = [
  { href: '/developer', label: 'API & Datasets', icon: Code2 },
  { href: '/api-docs', label: 'Swagger', icon: ExternalLink, external: true },
  { href: '/changelog', label: 'Patch History', icon: GitBranch },
  { href: '/legal', label: 'Legal Notice', icon: ShieldCheck },
];

const PRODUCT_AREAS = [
  {
    icon: Database,
    title: 'Multi-source engine',
    text: 'Cross-references internal Data.p4k (DataForge) records with the official RSI website (Ship Matrix, Store, Starmap, Galactapedia, Comm-Links) and UEX 2.0 economy.',
  },
  {
    icon: Code2,
    title: 'Public REST API',
    text: 'Open /api/v1 endpoints with interactive Swagger documentation, accessible immediately without requiring an API key or account.',
  },
  {
    icon: Layers,
    title: 'Bulk Data Packs',
    text: 'Pre-computed versioned JSON datasets per patch with SHA-256 checksums for desktop overlays, companion apps and external tools.',
  },
  {
    icon: Wrench,
    title: 'Calculators & Explorer',
    text: 'Compare, ranking, loadout, FPS, mining, crafting and trade calculators built directly on normalized bilingual EN/FR game data.',
  },
];

const API_POINTS = [
  'Immediate public read access to /api/v1/* and /api-docs without mandatory authentication.',
  'Optional Bearer tokens for high-throughput community projects needing extended rate limits.',
  'Cross-referenced identifiers (P4K UUID, class_name, RSI ID, UEX ID) on ships, items, commodities and locations.',
  'Historical patch querying (?version=4.x.x or ?env=live|ptu) and pre-built JSON data packs.',
];

const SOURCES_POINTS = [
  'Game files (Data.p4k / Game2.dcb): physical ship & component stats, default loadouts, FPS gear, crafting blueprints, missions, loot tables and mining rocks.',
  'Official RSI Scraper: Ship Matrix, Store MSRP & Loaner Matrix, high-res galleries, 3D Holoviewer models, ARK Starmap, Galactapedia, Comm-Links (Alexandria), Roadmap and Organizations.',
  'UEX Corp 2.0: live commodity buy/sell prices, all trade terminals, vehicle rental/purchase prices and refinery yields/methods.',
  'Bilingual Localization (EN + FR): official English global.ini cross-referenced with up-to-date community French translations (SC-FR).',
];

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`sci-panel p-5 ${className}`}>{children}</section>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm border border-cyan-500/30 bg-slate-950 px-2 py-1 font-orbitron text-[10px] uppercase tracking-widest text-cyan-400">
      {children}
    </span>
  );
}

export default function AboutPage() {
  return (
    <PageShell size="xl" className="p-4 md:p-6">
      <PageHeader
        eyebrow="Platform"
        title="About Starvis"
        subtitle="Unofficial Star Citizen Database & Toolset in active development."
        actions={
          <div className="flex flex-wrap gap-2">
            {PLATFORM_LINKS.map(({ href, label, icon: Icon, external }) =>
              external ? (
                <a key={href} href={href} target="_blank" rel="noreferrer" className="sci-btn-ghost px-3 py-2 text-xs">
                  <Icon size={13} />
                  {label}
                </a>
              ) : (
                <Link key={href} href={href} className="sci-btn-ghost px-3 py-2 text-xs">
                  <Icon size={13} />
                  {label}
                </Link>
              ),
            )}
          </div>
        }
      />

      <EarlyAccessNotice className="mb-4">
        Starvis is an open community data platform in active development. Extracted game fields, cross-referenced RSI/UEX records and localized strings are continuously validated across patches.
      </EarlyAccessNotice>

      <Panel className="overflow-hidden">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              <Pill>Open Data Engine</Pill>
              <Pill>Public API v1</Pill>
              <Pill>EN + FR Localization</Pill>
            </div>
            <h2 className="font-rajdhani text-2xl font-black uppercase tracking-wide text-cyan-300">
              One standard dataset for the whole Star Citizen community
            </h2>
            <p className="mt-3 max-w-3xl font-rajdhani text-base leading-relaxed text-slate-400">
              Starvis unifies Star Citizen game files (`Data.p4k` / `Game2.dcb`), official Roberts Space Industries website data, UEX Corp 2.0 economy data and bilingual EN/FR translations into one documented standard—ready for players, organizations and any community developer.
            </p>
          </div>
          <div className="rounded-sm border border-cyan-900/40 bg-cyan-950/10 p-4">
            <p className="mb-2 flex items-center gap-2 font-orbitron text-[10px] font-bold uppercase tracking-widest text-cyan-400">
              <GitBranch size={13} />
              Data approach
            </p>
            <p className="font-rajdhani text-sm leading-relaxed text-slate-400">
              Every entity links its internal P4K UUID and class name with official RSI and UEX identifiers, available both via granular REST endpoints (`/api/v1/*`) and bulk JSON data packs.
            </p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PRODUCT_AREAS.map(({ icon: Icon, title, text }) => (
          <Panel key={title}>
            <Icon size={18} className="mb-3 text-cyan-400" />
            <h3 className="font-orbitron text-sm font-bold uppercase tracking-widest text-slate-200">{title}</h3>
            <p className="mt-2 font-rajdhani text-sm leading-relaxed text-slate-500">{text}</p>
          </Panel>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="mb-4 flex items-center gap-2 border-b border-slate-800/70 pb-3">
            <Code2 size={15} className="text-cyan-400" />
            <h2 className="font-orbitron text-[10px] font-bold uppercase tracking-widest text-slate-400">Public API & Bulk Datasets</h2>
          </div>
          <p className="font-rajdhani text-sm leading-relaxed text-slate-400">
            Starvis is built as an open data hub for any Star Citizen project: web apps, desktop overlays, mobile companions, Discord bots or organization tools can query the REST API or download full patch bundles.
          </p>
          <ul className="mt-4 space-y-2">
            {API_POINTS.map((point) => (
              <li key={point} className="flex gap-2 font-rajdhani text-sm text-slate-500">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/developer" className="sci-btn-primary px-3 py-2 text-xs">
              API & Datasets
            </Link>
            <a href="/api-docs" target="_blank" rel="noreferrer" className="sci-btn-ghost px-3 py-2 text-xs">
              Swagger UI
            </a>
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center gap-2 border-b border-slate-800/70 pb-3">
            <Globe size={15} className="text-emerald-400" />
            <h2 className="font-orbitron text-[10px] font-bold uppercase tracking-widest text-slate-400">Cross-Referenced Data Sources</h2>
          </div>
          <p className="font-rajdhani text-sm leading-relaxed text-slate-400">
            Instead of relying on a single partial feed, Starvis reconciles official game files, official RSI web APIs and active community sources:
          </p>
          <ul className="mt-4 space-y-2">
            {SOURCES_POINTS.map((point) => (
              <li key={point} className="flex gap-2 font-rajdhani text-sm text-slate-500">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/changelog" className="sci-btn-ghost px-3 py-2 text-xs">
              View Patch Changelog
            </Link>
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <p className="font-orbitron text-[10px] font-bold uppercase tracking-widest text-amber-400">Important notice</p>
            <p className="mt-2 font-mono-sc text-[10px] leading-relaxed text-slate-600">Non official, active development, data quality improving continuously.</p>
          </div>
          <p className="font-rajdhani text-sm leading-relaxed text-slate-400">
            Starvis is an independent community project and is not affiliated with, endorsed by, sponsored by or officially connected to Cloud Imperium Games, Roberts Space Industries or their affiliates.
            Game data can be incomplete, outdated or inaccurate while extraction and validation improve.
          </p>
        </div>
      </Panel>
    </PageShell>
  );
}
