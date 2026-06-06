'use client';

import { BookOpen, Check, Copy, ExternalLink, Key, Lock, ShieldCheck, Terminal, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { useAuth } from '@/contexts/AuthContext';
import { ADMIN_ROLE, DEVELOPER_ROLE, hasDeveloperAccess } from '@/lib/app-constants';

type Notice = { type: 'success' | 'error'; text: string } | null;

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

export default function DeveloperPage() {
  const { user, loading } = useAuth();
  const [apiToken, setApiToken] = useState<string | null>(null);
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

  const swaggerLabel = useMemo(() => {
    if (!user) return 'Login required';
    if (!hasAccess) return 'Developer role required';
    if (isAdmin) return 'Full admin documentation';
    return 'Non-admin documentation';
  }, [hasAccess, isAdmin, user]);

  const generateToken = async () => {
    setGenerating(true);
    setApiToken(null);
    setNotice(null);
    setCopied(false);
    try {
      const res = await fetch('/api/auth/api-token', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Token generation failed');
      setApiToken(data.token);
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

  return (
    <PageShell size="xl" className="p-4 md:p-6">
      <PageHeader
        eyebrow="Developer"
        title="API Access"
        subtitle="Swagger access, external token generation and REST API connection details."
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
              <p className="font-rajdhani text-sm text-slate-400">Use the token as a Bearer credential against the REST API.</p>
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
${apiBaseUrl}/search?search=aurora`}</CodeBlock>
          </Section>
        </div>
      </div>
    </PageShell>
  );
}
