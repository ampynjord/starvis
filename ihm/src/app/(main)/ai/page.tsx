import type { Metadata } from 'next';
import Link from 'next/link';
import { Bot, BrainCircuit, Code2, Database, MessageSquareText, Network, ShieldCheck, Sparkles } from 'lucide-react';
import { EarlyAccessNotice } from '@/components/ui/EarlyAccessNotice';
import { OpenAiButton } from '@/components/ui/OpenAiButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';

export const metadata: Metadata = {
  title: 'Starvis AI Assistant',
  description:
    'Natural-language Star Citizen assistant connected to Starvis extracted data, web tools, Discord commands and the external API.',
};

const CAPABILITIES = [
  {
    icon: Database,
    title: 'Data-grounded answers',
    text: 'Ships, components, items, economy, missions, lore and extracted game data are queried through Starvis tools before the assistant answers.',
  },
  {
    icon: Network,
    title: 'Cross-tool guidance',
    text: 'The assistant can guide users toward calculators, comparisons, API routes, Discord commands and corporation workflows from one prompt.',
  },
  {
    icon: Code2,
    title: 'API copilot',
    text: 'Developer users can use Starvis as a companion for endpoint discovery, Swagger navigation and integration planning.',
  },
  {
    icon: Bot,
    title: 'Discord-ready',
    text: 'The same AI direction powers the Discord slash-command experience so community servers can ask questions without leaving Discord.',
  },
];

const ROADMAP = [
  'Better page-aware context so the assistant understands the exact ship, item, calculator or corporation screen currently open.',
  'More deterministic tool calls for comparisons, rankings, economy checks and tactical/fleet planning.',
  'Answer confidence labels that separate extracted facts, inferred recommendations and uncertain early-access data.',
  'Reusable AI workflows for external API users, Discord servers and corporation operations.',
];

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`sci-panel p-5 ${className}`}>{children}</section>;
}

export default function AiPage() {
  return (
    <PageShell size="xl" className="p-4 md:p-6">
      <PageHeader
        eyebrow="Platform"
        title="AI Assistant"
        subtitle="A natural-language layer for Starvis data, tools, Discord and the external API."
        actions={(
          <div className="flex flex-wrap gap-2">
            <OpenAiButton
              prompt="Explain how Starvis AI can help with ships, economy, lore, corporation tools, Discord and the external API."
              className="sci-btn-primary px-3 py-2 text-xs"
            >
              <Sparkles size={13} />
              Ask AI
            </OpenAiButton>
            <Link href="/developer" className="sci-btn-ghost px-3 py-2 text-xs">
              <Code2 size={13} />
              API Access
            </Link>
          </div>
        )}
      />

      <EarlyAccessNotice className="mb-4">
        Starvis AI is in active development. Answers can mix extracted facts, derived calculations and recommendations; uncertain data should be verified in game or through the source page.
      </EarlyAccessNotice>

      <Panel className="border-violet-900/50 bg-violet-950/10">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
          <div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-sm border border-violet-800/70 bg-violet-950/30 text-violet-300">
              <BrainCircuit size={25} />
            </div>
            <h2 className="font-orbitron text-2xl font-black uppercase tracking-widest text-violet-200">
              Stop hunting across separate tools
            </h2>
            <p className="mt-3 max-w-3xl font-rajdhani text-base leading-relaxed text-slate-400">
              The long-term goal is simple: Starvis should understand what you need, fetch the right extracted data, explain the tradeoffs and send you to the exact page,
              calculator, Discord command or API endpoint that solves the problem.
            </p>
          </div>
          <div className="rounded-sm border border-violet-900/50 bg-slate-950/35 p-4">
            <p className="mb-3 flex items-center gap-2 font-orbitron text-[10px] font-bold uppercase tracking-widest text-violet-300">
              <ShieldCheck size={13} />
              Guardrails
            </p>
            <p className="font-rajdhani text-sm leading-relaxed text-slate-400">
              Starvis favors tool-backed answers over generic replies. The assistant should cite Starvis data context, separate assumptions from facts and avoid pretending that early-access data is definitive.
            </p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {CAPABILITIES.map(({ icon: Icon, title, text }) => (
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
            <MessageSquareText size={15} className="text-cyan-400" />
            <h2 className="font-orbitron text-[10px] font-bold uppercase tracking-widest text-slate-400">Useful prompts</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              'Compare the Carrack and Galaxy for an exploration organization.',
              'Find a profitable trade plan for 200 SCU and explain the risk.',
              'Which API endpoints should I use for a Discord ship command?',
              'Summarize what is uncertain in FPS calculator data.',
            ].map((prompt) => (
              <OpenAiButton
                key={prompt}
                prompt={prompt}
                className="rounded-sm border border-cyan-900/60 bg-cyan-950/10 px-3 py-2 font-mono-sc text-[10px] text-cyan-300 transition-colors hover:border-cyan-500/70"
              >
                {prompt}
              </OpenAiButton>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center gap-2 border-b border-slate-800/70 pb-3">
            <Sparkles size={15} className="text-amber-400" />
            <h2 className="font-orbitron text-[10px] font-bold uppercase tracking-widest text-slate-400">AI roadmap</h2>
          </div>
          <ul className="space-y-2">
            {ROADMAP.map((item) => (
              <li key={item} className="flex gap-2 font-rajdhani text-sm leading-relaxed text-slate-500">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                {item}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </PageShell>
  );
}
