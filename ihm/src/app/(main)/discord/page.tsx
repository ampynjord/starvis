import { Bot, CheckCircle2, ExternalLink, MessageSquareText, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { DISCORD_BOT_COMMANDS, buildDiscordInviteUrl, getDiscordClientId } from '@/lib/discordBot';

export const dynamic = 'force-dynamic';

const categoryStyle: Record<string, string> = {
  AI: 'border-violet-800/60 bg-violet-950/25 text-violet-300',
  Ships: 'border-cyan-800/60 bg-cyan-950/25 text-cyan-300',
  Items: 'border-slate-700/70 bg-slate-900/50 text-slate-300',
  Economy: 'border-emerald-800/60 bg-emerald-950/20 text-emerald-300',
  Universe: 'border-amber-800/60 bg-amber-950/20 text-amber-300',
  System: 'border-blue-800/60 bg-blue-950/20 text-blue-300',
};

export default function DiscordBotPage() {
  const clientId = getDiscordClientId();
  const inviteUrl = buildDiscordInviteUrl(clientId);
  const grouped = DISCORD_BOT_COMMANDS.reduce<Record<string, typeof DISCORD_BOT_COMMANDS>>((acc, command) => {
    acc[command.category] = [...(acc[command.category] ?? []), command];
    return acc;
  }, {});

  return (
    <PageShell size="lg" className="p-4 md:p-6">
      <PageHeader
        eyebrow="Integration"
        title="Discord Bot"
        subtitle="Invite Starvis to Discord and query ships, trade, missions, lore and AI answers from slash commands."
        actions={inviteUrl ? (
          <a href={inviteUrl} target="_blank" rel="noreferrer" className="sci-btn-primary flex items-center gap-2 px-3 py-2 text-xs">
            <ExternalLink size={13} /> Invite bot
          </a>
        ) : null}
      />

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="sci-panel border border-cyan-900/50 p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-cyan-800/70 bg-cyan-950/30 text-cyan-300">
              <Bot size={24} />
            </div>
            <div className="min-w-0">
              <h2 className="font-orbitron text-sm font-bold uppercase tracking-widest text-white">Starvis in Discord</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                The bot exposes the Starvis database through slash commands: ships, components, items, commodities,
                shops, trade routes, mining, crafting, missions, locations, factions, lore, changelog, status and AI Q&A.
              </p>
              {inviteUrl ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <a href={inviteUrl} target="_blank" rel="noreferrer" className="sci-btn-primary flex items-center gap-2 px-4 py-2 text-xs">
                    <ExternalLink size={13} /> Invite to Discord
                  </a>
                  <span className="font-mono-sc text-[10px] text-slate-600">Uses Discord slash commands only; no admin permissions requested.</span>
                </div>
              ) : (
                <div className="mt-4 rounded-sm border border-amber-800/60 bg-amber-950/20 px-3 py-2 font-mono-sc text-xs text-amber-300">
                  Discord invite is not configured. Set NEXT_PUBLIC_DISCORD_CLIENT_ID or DISCORD_CLIENT_ID.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <div className="sci-panel border border-slate-800/60 p-3">
            <p className="flex items-center gap-2 font-orbitron text-[10px] font-bold uppercase tracking-widest text-cyan-400"><MessageSquareText size={12} /> Commands</p>
            <p className="mt-2 font-mono-sc text-2xl text-white">{DISCORD_BOT_COMMANDS.length}</p>
          </div>
          <div className="sci-panel border border-slate-800/60 p-3">
            <p className="flex items-center gap-2 font-orbitron text-[10px] font-bold uppercase tracking-widest text-emerald-400"><ShieldCheck size={12} /> Permissions</p>
            <p className="mt-2 font-mono-sc text-xs text-slate-400">bot + applications.commands</p>
          </div>
          <div className="sci-panel border border-slate-800/60 p-3">
            <p className="flex items-center gap-2 font-orbitron text-[10px] font-bold uppercase tracking-widest text-violet-400"><Sparkles size={12} /> AI</p>
            <p className="mt-2 font-mono-sc text-xs text-slate-400">/starvis uses the connected Starvis AI assistant.</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-cyan-500" />
          <h2 className="font-orbitron text-xs font-bold uppercase tracking-widest text-slate-300">Command help</h2>
        </div>
        {Object.entries(grouped).map(([category, commands]) => (
          <div key={category} className="space-y-2">
            <span className={`inline-flex rounded-sm border px-2 py-1 font-orbitron text-[9px] font-bold uppercase tracking-widest ${categoryStyle[category] ?? categoryStyle.System}`}>
              {category}
            </span>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {commands.map((command) => (
                <article key={command.name} className="rounded-sm border border-slate-800/60 bg-slate-950/35 p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={12} className="shrink-0 text-cyan-500" />
                    <h3 className="font-orbitron text-xs font-bold text-white">/{command.name}</h3>
                  </div>
                  <p className="mt-2 min-h-10 text-sm leading-5 text-slate-400">{command.description}</p>
                  <code className="mt-3 block truncate rounded-sm border border-slate-800 bg-slate-950/80 px-2 py-1.5 font-mono-sc text-[10px] text-cyan-300">
                    {command.usage}
                  </code>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>
    </PageShell>
  );
}
