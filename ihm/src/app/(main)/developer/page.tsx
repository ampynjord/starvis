import { BookOpen, Bot, BrainCircuit, Database, ExternalLink, Key, Radar, Terminal, UsersRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EarlyAccessNotice } from '@/components/ui/EarlyAccessNotice';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { PUBLIC_SITE_URL } from '@/lib/server-config';

export const metadata: Metadata = {
  title: 'Public API - STARVIS',
  description:
    'The Starvis REST API: Star Citizen ships, components, items, economy, missions, locations and lore, readable anonymously or with a project token.',
};

const API_BASE_URL = `${PUBLIC_SITE_URL}/api/v1`;

const API_USE_CASES = [
  { icon: Bot, title: 'Bots and overlays', text: 'Power Discord commands, widgets, companion tools or public utilities with normalized Starvis data.' },
  { icon: Database, title: 'Data products', text: 'Query ships, loadouts, economy, items, missions, lore and changelog data without rebuilding an extractor.' },
  { icon: Radar, title: 'Dashboards and audits', text: 'Feed fleet tools, quality audits or monitoring from the same data the wiki shows.' },
  { icon: BrainCircuit, title: 'AI workflows', text: 'Ground your own assistant in extracted game data rather than guesses.' },
];

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="sci-panel p-5 space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-800/60 pb-3">
        <Icon size={14} className="text-cyan-400 shrink-0" />
        <h2 className="font-orbitron text-[10px] font-bold tracking-widest uppercase text-slate-400">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-sm border border-slate-800 bg-slate-950 px-4 py-3 text-[11px] font-mono text-slate-300 whitespace-pre">
      {children}
    </pre>
  );
}

export default function DeveloperPage() {
  return (
    <PageShell size="xl" className="p-4 md:p-6">
      <PageHeader
        eyebrow="Developer"
        title="Public API & Datasets"
        subtitle="The data behind the wiki, as a REST API: readable without an account, with a project token when you need more."
        actions={
          <a
            href="/api-docs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded border border-cyan-700/50 bg-cyan-900/30 px-3 py-2 font-mono-sc text-xs text-cyan-300 transition-colors hover:border-cyan-500/70 hover:bg-cyan-900/50"
          >
            <BookOpen size={14} />
            Open Swagger
            <ExternalLink size={11} className="text-cyan-600" />
          </a>
        }
      />

      <EarlyAccessNotice className="mb-4">
        External API schemas are stabilizing, but Starvis is still in early access. Use Swagger as the source of truth and expect some data fields to evolve with extraction improvements.
      </EarlyAccessNotice>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-4 min-w-0">
          <Section title="Access" icon={Key}>
            <div className="space-y-3 font-rajdhani text-sm text-slate-400">
              <p>
                <span className="text-slate-200">Anonymous.</span> Every read endpoint under <code className="font-mono-sc text-xs text-cyan-400">/api/v1</code> answers
                without credentials, under a per-IP rate limit.
              </p>
              <p>
                <span className="text-slate-200">Project token.</span> For a bot, an overlay or a sync job that needs more than the anonymous limit, ask for a token
                on the Starvis Discord server, with the name of your project. Tokens are issued by hand, last one year and can be revoked on request.
              </p>
              <p>
                A token you send must be valid: a revoked or expired token gets a <code className="font-mono-sc text-xs text-cyan-400">401</code>, it never falls back to
                anonymous access, so you notice it.
              </p>
              <Link
                href="/discord"
                className="inline-flex items-center gap-2 rounded border border-cyan-900/70 px-3 py-2 font-mono-sc text-xs text-cyan-300 hover:border-cyan-500 hover:text-cyan-100"
              >
                <UsersRound size={13} />
                Ask for a token on Discord
              </Link>
            </div>
          </Section>

          <Section title="Use cases" icon={Radar}>
            <div className="grid gap-3 sm:grid-cols-2">
              {API_USE_CASES.map(({ icon: Icon, title, text }) => (
                <div key={title} className="border border-slate-800/70 bg-slate-950/40 p-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <Icon size={13} className="text-cyan-500 shrink-0" />
                    <h3 className="font-rajdhani text-sm font-semibold text-slate-200">{title}</h3>
                  </div>
                  <p className="font-rajdhani text-xs leading-relaxed text-slate-500">{text}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div className="space-y-4 min-w-0">
          <Section title="Request format" icon={Terminal}>
            <div className="space-y-3">
              <p className="font-rajdhani text-sm text-slate-400">Anonymous:</p>
              <CodeBlock>{`curl "${API_BASE_URL}/ships?limit=20&page=1"`}</CodeBlock>
              <p className="font-rajdhani text-sm text-slate-400">With a project token:</p>
              <CodeBlock>{`curl -H "Authorization: Bearer YOUR_API_TOKEN" \\
  "${API_BASE_URL}/ships?limit=20&page=1"`}</CodeBlock>
            </div>
          </Section>

          <Section title="Base endpoints" icon={BookOpen}>
            <CodeBlock>{`${API_BASE_URL}/ships
${API_BASE_URL}/components
${API_BASE_URL}/items
${API_BASE_URL}/commodities
${API_BASE_URL}/missions
${API_BASE_URL}/locations
${API_BASE_URL}/starmap/positions
${API_BASE_URL}/search?search=aurora`}</CodeBlock>
          </Section>
        </div>
      </div>
    </PageShell>
  );
}
