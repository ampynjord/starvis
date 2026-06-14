'use client';

import { BookOpen, Bot, BrainCircuit, Check, Copy, Database, ExternalLink, Key, Lock, Radar, Send, ShieldCheck, Terminal, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { EarlyAccessNotice } from '@/components/ui/EarlyAccessNotice';
import { OpenAiButton } from '@/components/ui/OpenAiButton';
import { useAuth } from '@/contexts/AuthContext';
import { ADMIN_ROLE, DEVELOPER_ROLE, hasDeveloperAccess } from '@/lib/app-constants';

type Notice = { type: 'success' | 'error'; text: string } | null;
type ApiAccessRequest = {
  id: number;
  motivation: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

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

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  const Icon = ok ? Check : X;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-900/80 py-2 last:border-b-0">
      <span className="text-xs font-mono-sc text-slate-500">{label}</span>
      <span className={`inline-flex items-center gap-1.5 text-xs font-mono-sc ${ok ? 'text-emerald-400' : 'text-slate-600'}`}>
        <Icon size={13} />
        {ok ? 'Enabled' : 'Locked'}
      </span>
    </div>
  );
}

const API_USE_CASES = [
  { icon: Bot, title: 'Bots and overlays', text: 'Power Discord commands, widgets, companion tools or public utilities with normalized Starvis data.' },
  { icon: Database, title: 'Data products', text: 'Query ships, loadouts, economy, items, missions, lore and changelog data without rebuilding an extractor.' },
  { icon: Radar, title: 'Operations', text: 'Feed corporation dashboards, fleet tools, quality audits or monitoring with authenticated API access.' },
  { icon: BrainCircuit, title: 'AI workflows', text: 'Use the Starvis chat endpoints as a tool-using Star Citizen assistant connected to the same database.' },
];

export default function DeveloperPage() {
  const { user, loading } = useAuth();
  const [accessRequest, setAccessRequest] = useState<ApiAccessRequest | null>(null);
  const [motivation, setMotivation] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestNotice, setRequestNotice] = useState<Notice>(null);
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [apiTokenName, setApiTokenName] = useState('External project token');
  const [apiTokenDescription, setApiTokenDescription] = useState('');
  const [apiTokenMeta, setApiTokenMeta] = useState<{ name: string; expiresAt: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [origin, setOrigin] = useState('https://starvis.ampynjord.bzh');

  const hasAccess = hasDeveloperAccess(user?.role);
  const isAdmin = user?.role === ADMIN_ROLE;
  const roleLabel = user?.role ?? 'anonymous';
  const apiBaseUrl = `${origin}/api/v1`;

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (loading || !user || hasAccess) return;
    let cancelled = false;
    setRequestLoading(true);
    fetch('/api/auth/developer-access-request')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'Failed to load request');
        if (!cancelled) setAccessRequest(data.data ?? null);
      })
      .catch((error) => {
        if (!cancelled) setRequestNotice({ type: 'error', text: error instanceof Error ? error.message : 'Failed to load request' });
      })
      .finally(() => {
        if (!cancelled) setRequestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasAccess, loading, user]);

  const swaggerLabel = useMemo(() => {
    if (!user) return 'Login required';
    if (!hasAccess) return 'Developer role required';
    if (isAdmin) return 'Full admin documentation';
    return 'Non-admin documentation';
  }, [hasAccess, isAdmin, user]);

  const generateToken = async () => {
    setGenerating(true);
    setApiToken(null);
    setApiTokenMeta(null);
    setNotice(null);
    setCopied(false);
    try {
      const res = await fetch('/api/auth/api-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: apiTokenName,
          description: apiTokenDescription || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Token generation failed');
      setApiToken(data.token);
      setApiTokenMeta({ name: data.name ?? apiTokenName, expiresAt: data.expiresAt });
      setNotice({ type: 'success', text: 'Token generated. Copy it now, it will not be shown again.' });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message ?? 'Token generation failed' });
    } finally {
      setGenerating(false);
    }
  };

  const copyToken = async () => {
    if (!apiToken) return;
    await navigator.clipboard.writeText(apiToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const submitAccessRequest = async () => {
    setRequestSubmitting(true);
    setRequestNotice(null);
    try {
      const res = await fetch('/api/auth/developer-access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivation }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit request');
      setAccessRequest(data.data);
      setMotivation('');
      setRequestNotice({ type: 'success', text: 'Request sent. An admin can now review it from the admin panel.' });
    } catch (err: any) {
      setRequestNotice({ type: 'error', text: err.message ?? 'Failed to submit request' });
    } finally {
      setRequestSubmitting(false);
    }
  };

  const requestStatusStyle =
    accessRequest?.status === 'approved'
      ? 'border-emerald-800/40 bg-emerald-950/20 text-emerald-400'
      : accessRequest?.status === 'rejected'
        ? 'border-red-800/40 bg-red-950/20 text-red-400'
        : 'border-amber-800/40 bg-amber-950/20 text-amber-400';

  if (loading) {
    return (
      <PageShell size="xl" className="p-4 md:p-6">
        <div className="p-8 text-center font-mono-sc text-sm text-slate-600">LOADING SESSION...</div>
      </PageShell>
    );
  }

  return (
    <PageShell size="xl" className="p-4 md:p-6">
      <PageHeader
        eyebrow="Developer"
        title="API Access"
        subtitle="External API, Swagger documentation, project tokens and AI endpoints for tools built on Starvis data."
        actions={
          hasAccess ? (
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
          ) : undefined
        }
      />

      <EarlyAccessNotice className="mb-4">
        External API schemas are stabilizing, but Starvis is still in early access. Use Swagger as the source of truth and expect some data fields to evolve with extraction improvements.
      </EarlyAccessNotice>

      {!loading && user && !hasAccess && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <Section title="Restricted developer area" icon={Lock}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-sm border border-slate-800 bg-slate-950/40 px-3 py-3">
                <p className="font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">Session</p>
                <p className="mt-1 truncate font-orbitron text-sm text-slate-200">{user.username}</p>
              </div>
              <div className="rounded-sm border border-slate-800 bg-slate-950/40 px-3 py-3">
                <p className="font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">Role</p>
                <p className="mt-1 font-orbitron text-sm text-slate-500">{roleLabel}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-sm border border-amber-800/40 bg-amber-950/10 px-4 py-3">
              <Lock size={14} className="mt-0.5 shrink-0 text-amber-500" />
              <p className="font-rajdhani text-sm leading-relaxed text-slate-400">
                Swagger, API token generation and developer tooling are reserved for <span className="font-semibold text-cyan-300">developer</span> and{' '}
                <span className="font-semibold text-cyan-300">admin</span> accounts. Send an access request for external API usage.
              </p>
            </div>
          </Section>

          <Section title="External API access request" icon={Send}>
            {requestLoading ? (
              <p className="font-mono-sc text-xs text-slate-600">Loading current request...</p>
            ) : accessRequest ? (
              <div className="space-y-3">
                <div className={`rounded-sm border px-3 py-2 text-xs font-mono-sc ${requestStatusStyle}`}>
                  Status: {accessRequest.status.toUpperCase()} · sent {new Date(accessRequest.createdAt).toLocaleDateString()}
                </div>
                <div className="rounded-sm border border-slate-800 bg-slate-950/40 p-3">
                  <p className="mb-2 font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">Motivation</p>
                  <p className="whitespace-pre-wrap font-rajdhani text-sm leading-relaxed text-slate-400">{accessRequest.motivation}</p>
                </div>
                {accessRequest.adminNote && (
                  <div className="rounded-sm border border-slate-800 bg-slate-950/40 p-3">
                    <p className="mb-2 font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">Admin note</p>
                    <p className="font-rajdhani text-sm leading-relaxed text-slate-400">{accessRequest.adminNote}</p>
                  </div>
                )}
                {accessRequest.status === 'rejected' && (
                  <p className="font-rajdhani text-sm text-slate-500">Contact an admin before submitting a new request.</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">Motivation</span>
                  <textarea
                    value={motivation}
                    onChange={(event) => setMotivation(event.target.value)}
                    minLength={40}
                    maxLength={2000}
                    rows={7}
                    placeholder="Explain your project, expected API usage, Discord bot/tool name, data needs, and how you plan to respect Starvis rate limits and attribution."
                    disabled={requestSubmitting}
                    className="w-full resize-y rounded-sm border border-slate-800 bg-slate-950/70 px-3 py-2 font-rajdhani text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-700 focus:border-cyan-700/70 disabled:opacity-50"
                  />
                </label>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono-sc text-[10px] text-slate-600">{motivation.trim().length}/2000 · minimum 40 chars</p>
                  <button
                    type="button"
                    onClick={submitAccessRequest}
                    disabled={requestSubmitting || motivation.trim().length < 40}
                    className="inline-flex items-center gap-2 rounded border border-cyan-700/50 bg-cyan-900/40 px-4 py-2 font-mono-sc text-sm text-cyan-300 transition-colors hover:border-cyan-500/70 hover:bg-cyan-900/60 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Send size={14} />
                    {requestSubmitting ? 'Sending...' : 'Send request'}
                  </button>
                </div>
              </div>
            )}
            {requestNotice && (
              <p
                className={`rounded-sm border px-3 py-2 text-xs font-mono-sc ${
                  requestNotice.type === 'success' ? 'border-emerald-800/40 bg-emerald-950/20 text-emerald-400' : 'border-red-800/40 bg-red-950/20 text-red-400'
                }`}
              >
                {requestNotice.text}
              </p>
            )}
          </Section>
        </div>
      )}

      {!loading && user && !hasAccess ? null : (
        <>

      <section className="sci-panel p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]">
          <div>
            <p className="mb-2 font-mono-sc text-[9px] uppercase tracking-widest text-cyan-600">Platform surface</p>
            <h2 className="font-orbitron text-lg font-bold uppercase tracking-widest text-cyan-300">Build on Starvis instead of rebuilding Starvis</h2>
            <p className="mt-3 max-w-3xl font-rajdhani text-sm leading-relaxed text-slate-400">
              The external API is the integration layer for third-party projects: bots, community tools, corporation dashboards, audits and AI workflows can reuse the same extracted and normalized data as the web interface.
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2 lg:justify-end">
            <OpenAiButton
              prompt="Help me build a third-party integration with the Starvis external API. Explain authentication, useful endpoints and one example workflow."
              className="rounded-sm border border-violet-800/50 bg-violet-950/20 px-3 py-2 font-mono-sc text-xs text-violet-300 transition-colors hover:border-violet-500/70 hover:bg-violet-950/40"
            >
              Ask AI for an integration plan
            </OpenAiButton>
            <a href="/api-docs" target="_blank" rel="noreferrer" className="sci-btn-primary px-3 py-2 text-xs">
              Open Swagger
            </a>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {API_USE_CASES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-sm border border-slate-800 bg-slate-950/35 p-3">
              <Icon size={15} className="mb-2 text-cyan-400" />
              <p className="font-orbitron text-[10px] font-bold uppercase tracking-widest text-slate-300">{title}</p>
              <p className="mt-2 font-rajdhani text-xs leading-relaxed text-slate-500">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-4">
          <Section title="Access state" icon={ShieldCheck}>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-sm border border-slate-800 bg-slate-950/40 px-3 py-3">
                <p className="font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">Session</p>
                <p className="mt-1 truncate font-orbitron text-sm text-slate-200">{loading ? 'Checking...' : user ? user.username : 'Not connected'}</p>
              </div>
              <div className="rounded-sm border border-slate-800 bg-slate-950/40 px-3 py-3">
                <p className="font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">Role</p>
                <p className={`mt-1 font-orbitron text-sm ${hasAccess ? 'text-cyan-300' : 'text-slate-500'}`}>{roleLabel}</p>
              </div>
              <div className="rounded-sm border border-slate-800 bg-slate-950/40 px-3 py-3">
                <p className="font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">Swagger</p>
                <p className={`mt-1 font-orbitron text-sm ${hasAccess ? 'text-emerald-400' : 'text-amber-400'}`}>{swaggerLabel}</p>
              </div>
            </div>

            <div className="rounded-sm border border-slate-800/80 bg-slate-950/30 px-4">
              <StatusRow ok={hasAccess} label="Swagger UI" />
              <StatusRow ok={hasAccess} label="API token generation" />
              <StatusRow ok={isAdmin} label="Admin routes in Swagger" />
            </div>

            {!user && !loading && (
              <div className="flex flex-wrap items-center gap-3 rounded-sm border border-amber-800/40 bg-amber-950/10 px-4 py-3">
                <UserRound size={14} className="text-amber-500" />
                <p className="flex-1 font-rajdhani text-sm text-slate-400">Sign in with a developer or admin account to unlock Swagger and token generation.</p>
                <Link href="/login?redirect=/developer" className="rounded border border-slate-700 px-3 py-2 font-mono-sc text-xs text-slate-300 hover:border-cyan-700/60">
                  Login
                </Link>
              </div>
            )}

            {user && !hasAccess && (
              <div className="flex items-start gap-3 rounded-sm border border-amber-800/40 bg-amber-950/10 px-4 py-3">
                <Lock size={14} className="mt-0.5 shrink-0 text-amber-500" />
                <p className="font-rajdhani text-sm leading-relaxed text-slate-400">
                  Your account is currently <span className="font-semibold text-slate-300">{user.role}</span>. Ask an admin to assign the{' '}
                  <span className="font-semibold text-cyan-300">{DEVELOPER_ROLE}</span> role for API documentation and external tokens.
                </p>
              </div>
            )}
          </Section>

          <Section title="API token" icon={Key}>
            <div className="space-y-3">
              <p className="font-rajdhani text-sm leading-relaxed text-slate-400">
                Generate a long-lived Bearer token for external scripts and integrations. Store it securely after copying it.
              </p>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <label className="block">
                  <span className="mb-1 block font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">Project name</span>
                  <input
                    value={apiTokenName}
                    onChange={(event) => setApiTokenName(event.target.value)}
                    maxLength={120}
                    disabled={!hasAccess || generating}
                    className="w-full rounded-sm border border-slate-800 bg-slate-950/70 px-3 py-2 font-rajdhani text-sm text-slate-200 outline-none transition-colors focus:border-cyan-700/70 disabled:opacity-50"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">Description</span>
                  <input
                    value={apiTokenDescription}
                    onChange={(event) => setApiTokenDescription(event.target.value)}
                    maxLength={500}
                    placeholder="Discord bot, public tool, data audit..."
                    disabled={!hasAccess || generating}
                    className="w-full rounded-sm border border-slate-800 bg-slate-950/70 px-3 py-2 font-rajdhani text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-700 focus:border-cyan-700/70 disabled:opacity-50"
                  />
                </label>
              </div>

              {notice && (
                <p
                  className={`rounded-sm border px-3 py-2 text-xs font-mono-sc ${
                    notice.type === 'success' ? 'border-emerald-800/40 bg-emerald-950/20 text-emerald-400' : 'border-red-800/40 bg-red-950/20 text-red-400'
                  }`}
                >
                  {notice.text}
                </p>
              )}

              {apiToken && (
                <div className="space-y-2">
                  {apiTokenMeta && (
                    <p className="font-mono-sc text-[10px] text-slate-500">
                      {apiTokenMeta.name} · expires {new Date(apiTokenMeta.expiresAt).toLocaleDateString()}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-[10px] text-slate-300">
                      {apiToken}
                    </code>
                    <button
                      type="button"
                      onClick={copyToken}
                      className="shrink-0 rounded border border-slate-700 p-2 text-slate-400 transition-colors hover:border-cyan-700/50 hover:bg-white/5"
                      title="Copy token"
                    >
                      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={generateToken}
                disabled={!hasAccess || generating}
                className="inline-flex items-center gap-2 rounded border border-cyan-700/50 bg-cyan-900/40 px-4 py-2 font-mono-sc text-sm text-cyan-300 transition-colors hover:border-cyan-500/70 hover:bg-cyan-900/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Key size={14} />
                {generating ? 'Generating...' : 'Generate API token'}
              </button>
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Request format" icon={Terminal}>
            <div className="space-y-3">
              <p className="font-rajdhani text-sm text-slate-400">Use the token as a Bearer credential against the REST API. Public browser pages use an internal proxy; external projects must authenticate directly.</p>
              <CodeBlock>{`curl -H "Authorization: Bearer YOUR_API_TOKEN" \\
  "${apiBaseUrl}/ships?limit=20&page=1"`}</CodeBlock>
            </div>
          </Section>

          <Section title="Base endpoints" icon={BookOpen}>
            <CodeBlock>{`${apiBaseUrl}/ships
${apiBaseUrl}/components
${apiBaseUrl}/items
${apiBaseUrl}/commodities
${apiBaseUrl}/missions
${apiBaseUrl}/locations
${apiBaseUrl}/starmap/positions
${apiBaseUrl}/search?search=aurora
${apiBaseUrl}/chat/ask`}</CodeBlock>
          </Section>
        </div>
      </div>
        </>
      )}
    </PageShell>
  );
}
