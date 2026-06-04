import type { Metadata } from 'next';
import { BookOpen, Code2, ExternalLink, Key, Lock, Terminal, Zap } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';

export const metadata: Metadata = {
  title: 'Developer API - STARVIS',
  description: 'Documentation and access instructions for the Starvis external REST API.',
};

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="sci-panel p-5 space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-800/60 pb-3">
        <Icon size={14} className="text-cyan-400 shrink-0" />
        <h2 className="font-orbitron text-[10px] font-bold tracking-widest uppercase text-slate-400">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="bg-slate-950 border border-slate-800 rounded-sm px-4 py-3 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

export default function DeveloperPage() {
  return (
    <PageShell size="lg" className="p-4 md:p-6">
      <PageHeader
        eyebrow="Developer"
        title="Developer API"
        subtitle="External REST API - Developer access required."
      />

      <div className="flex items-start gap-3 rounded-sm border border-amber-800/40 bg-amber-950/10 px-4 py-3">
        <Lock size={14} className="text-amber-500 mt-0.5 shrink-0" />
        <p className="font-rajdhani text-sm text-slate-400">
          The external API is accessible to <span className="text-amber-400 font-semibold">developer</span> and{' '}
          <span className="text-amber-400 font-semibold">admin</span> accounts only. Generate an API token from your
          profile to authenticate your requests.
        </p>
      </div>

      <Section title="API Documentation" icon={BookOpen}>
        <p className="font-rajdhani text-sm text-slate-400 leading-relaxed">
          Swagger UI exposes the current endpoints, parameters, and response schemas for the public REST API.
        </p>
        <a
          href="/api-docs"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 py-2 px-4 bg-cyan-900/30 border border-cyan-700/50 hover:border-cyan-500/70 hover:bg-cyan-900/50 text-cyan-300 font-mono-sc text-sm rounded transition-colors"
        >
          <BookOpen size={14} />
          Open Swagger UI
          <ExternalLink size={11} className="text-cyan-600" />
        </a>
      </Section>

      <Section title="Generate an API token" icon={Key}>
        <p className="font-rajdhani text-sm text-slate-400 leading-relaxed">
          API tokens are long-lived JWTs tied to your account. Generate one from your profile, then store it securely
          because it will not be shown again.
        </p>
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 py-2 px-4 bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-slate-100 font-mono-sc text-sm rounded transition-colors"
        >
          <Key size={14} />
          Go to Profile / API Token
        </Link>
      </Section>

      <Section title="Authentication" icon={Lock}>
        <p className="font-rajdhani text-sm text-slate-400">
          All API requests must include a Bearer token in the Authorization header:
        </p>
        <Code>{`GET /api/v1/ships HTTP/1.1
Host: starvis.ampynjord.bzh
Authorization: Bearer YOUR_API_TOKEN`}</Code>
      </Section>

      <Section title="Base URL & versioning" icon={Zap}>
        <p className="font-rajdhani text-sm text-slate-400">
          Game data endpoints are versioned under <code className="font-mono text-cyan-400">/api/v1/</code>.
        </p>
        <Code>{`https://starvis.ampynjord.bzh/api/v1/ships
https://starvis.ampynjord.bzh/api/v1/components
https://starvis.ampynjord.bzh/api/v1/manufacturers
https://starvis.ampynjord.bzh/api/v1/items
https://starvis.ampynjord.bzh/api/v1/commodities
https://starvis.ampynjord.bzh/api/v1/missions
https://starvis.ampynjord.bzh/api/v1/locations
https://starvis.ampynjord.bzh/api/v1/ships/{uuid}/paints
https://starvis.ampynjord.bzh/api/v1/search?q=aurora`}</Code>
      </Section>

      <Section title="Example request" icon={Terminal}>
        <p className="font-rajdhani text-sm text-slate-400">Fetch the first page of ships with curl:</p>
        <Code>{`curl -H "Authorization: Bearer YOUR_TOKEN" \\
  "https://starvis.ampynjord.bzh/api/v1/ships?limit=20&page=1"`}</Code>
      </Section>

      <Section title="Rate limits" icon={Code2}>
        <p className="font-rajdhani text-sm text-slate-400 leading-relaxed">
          The API applies rate limiting to protect the service. Requests that exceed the limit receive a{' '}
          <code className="font-mono text-amber-400">429 Too Many Requests</code> response. The headers{' '}
          <code className="font-mono text-slate-300">X-RateLimit-Limit</code> and{' '}
          <code className="font-mono text-slate-300">X-RateLimit-Remaining</code> indicate the current state.
        </p>
      </Section>
    </PageShell>
  );
}
