'use client';

export const dynamic = 'force-dynamic';

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Clock,
  Cpu,
  Database,
  Gauge,
  Globe,
  HardDrive,
  KeyRound,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  User,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { StatCard, StatGrid } from '@/components/ui/StatCard';
import { useAuth } from '@/contexts/AuthContext';
import { ADMIN_ROLE } from '@/lib/app-constants';

// ── Types ────────────────────────────────────────────────────────────────────

interface ReadyState {
  status: string;
  checks: { database: boolean; redis: boolean };
}

interface CacheStats {
  hits: number;
  misses: number;
  total: number;
  hitRate: string;
  connected: boolean;
}

interface PromSample {
  labels: Record<string, string>;
  value: number;
}

interface RouteTraffic {
  route: string;
  requests: number;
  errors: number;
  avgMs: number | null;
}

interface RequestLogEntry {
  id: number;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  isExternalApi: boolean;
  authMethod: 'admin_key' | 'api_token' | 'session' | 'anonymous' | 'unknown';
  clientType: 'external_api' | 'web_session' | 'internal_web_proxy' | 'server_key' | 'anonymous_web' | 'unknown';
  internalClient: string | null;
  apiTokenId: number | null;
  apiTokenName: string | null;
  userId: number | null;
  username: string | null;
  role: string | null;
  ip: string | null;
  userAgent: string | null;
}

interface Snapshot {
  ready: ReadyState | null;
  cache: CacheStats | null;
  totalRequests: number;
  totalErrors: number;
  avgLatencyMs: number | null;
  memoryBytes: number | null;
  heapUsedBytes: number | null;
  eventLoopLagMs: number | null;
  uptimeSeconds: number | null;
  routes: RouteTraffic[];
  statusCounts: Record<string, number>;
  fetchedAt: number;
}

interface DiscordBotStatus {
  configured: boolean;
  clientId: string | null;
  guildId: string | null;
  inviteUrl: string | null;
  serverInviteUrl: string | null;
  commandCount: number;
  commands: Array<{ name: string; category: string; description: string }>;
}

interface ApiSupervisionUser {
  userId: number;
  username: string | null;
  role: string | null;
  lastSeenAt: string;
  requestCount: number;
  externalApiRequests: number;
  webRequests: number;
}

interface ApiSupervisionProject {
  tokenId: number;
  name: string;
  description: string | null;
  owner: { id: number; username: string; email: string; role: string } | null;
  status: 'active' | 'expired' | 'revoked';
  connected: boolean;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  requestsInBuffer: number;
  recentRequests: number;
  lastUsedIp: string | null;
  lastUserAgent: string | null;
}

interface ApiSupervisionSnapshot {
  generatedAt: string;
  summary: {
    externalApiRequests15m: number;
    externalApiRequests24h: number;
    serverKeyRequests15m: number;
    activeUsers15m: number;
    generatedTokens: number;
    activeTokens: number;
    revokedTokens: number;
    expiredTokens: number;
    tokensUsed24h: number;
    connectedProjects: number;
  };
  activeUsers: ApiSupervisionUser[];
  projects: ApiSupervisionProject[];
  recentExternalRequests: RequestLogEntry[];
}

// ── Prometheus text parser ───────────────────────────────────────────────────

function parsePrometheus(text: string): Map<string, PromSample[]> {
  const out = new Map<string, PromSample[]>();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([^\s]+)/);
    if (!match) continue;
    const [, name, rawLabels, rawValue] = match;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    const labels: Record<string, string> = {};
    if (rawLabels) {
      for (const part of rawLabels.slice(1, -1).matchAll(/(\w+)="((?:[^"\\]|\\.)*)"/g)) {
        labels[part[1]] = part[2];
      }
    }
    const list = out.get(name) ?? [];
    list.push({ labels, value });
    out.set(name, list);
  }
  return out;
}

function sum(samples: PromSample[] | undefined, filter?: (labels: Record<string, string>) => boolean) {
  if (!samples) return 0;
  return samples.reduce((acc, s) => (filter && !filter(s.labels) ? acc : acc + s.value), 0);
}

function buildSnapshot(metrics: Map<string, PromSample[]>, ready: ReadyState | null, cache: CacheStats | null): Snapshot {
  const requests = metrics.get('starvis_http_requests_total') ?? [];
  const durSum = metrics.get('starvis_http_request_duration_seconds_sum') ?? [];
  const durCount = metrics.get('starvis_http_request_duration_seconds_count') ?? [];

  const totalRequests = sum(requests);
  const totalErrors = sum(requests, (l) => l.status_code >= '500');
  const totalDurSum = sum(durSum);
  const totalDurCount = sum(durCount);

  const byRoute = new Map<string, { requests: number; errors: number; durSum: number; durCount: number }>();
  for (const s of requests) {
    const route = s.labels.route ?? 'unknown';
    const entry = byRoute.get(route) ?? { requests: 0, errors: 0, durSum: 0, durCount: 0 };
    entry.requests += s.value;
    if ((s.labels.status_code ?? '') >= '500') entry.errors += s.value;
    byRoute.set(route, entry);
  }
  for (const s of durSum) {
    const entry = byRoute.get(s.labels.route ?? 'unknown');
    if (entry) entry.durSum += s.value;
  }
  for (const s of durCount) {
    const entry = byRoute.get(s.labels.route ?? 'unknown');
    if (entry) entry.durCount += s.value;
  }

  const routes: RouteTraffic[] = [...byRoute.entries()]
    .map(([route, e]) => ({
      route,
      requests: e.requests,
      errors: e.errors,
      avgMs: e.durCount > 0 ? (e.durSum / e.durCount) * 1000 : null,
    }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 12);

  const statusCounts: Record<string, number> = {};
  for (const s of requests) {
    const code = s.labels.status_code ?? '???';
    const family = `${code[0]}xx`;
    statusCounts[family] = (statusCounts[family] ?? 0) + s.value;
  }

  const startTime = metrics.get('starvis_process_start_time_seconds')?.[0]?.value ?? null;
  const lag = metrics.get('starvis_nodejs_eventloop_lag_seconds')?.[0]?.value ?? null;

  return {
    ready,
    cache,
    totalRequests,
    totalErrors,
    avgLatencyMs: totalDurCount > 0 ? (totalDurSum / totalDurCount) * 1000 : null,
    memoryBytes: metrics.get('starvis_process_resident_memory_bytes')?.[0]?.value ?? null,
    heapUsedBytes: metrics.get('starvis_nodejs_heap_size_used_bytes')?.[0]?.value ?? null,
    eventLoopLagMs: lag !== null ? lag * 1000 : null,
    uptimeSeconds: startTime !== null ? Date.now() / 1000 - startTime : null,
    routes,
    statusCounts,
    fetchedAt: Date.now(),
  };
}

// ── Formatting helpers ───────────────────────────────────────────────────────

function fmtBytes(bytes: number | null) {
  if (bytes === null) return '—';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function fmtUptime(seconds: number | null) {
  if (seconds === null) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtMs(ms: number | null) {
  if (ms === null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(1)} ms`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function statusStyle(statusCode: number) {
  if (statusCode >= 500) return 'border-rose-800/60 bg-rose-950/30 text-rose-300';
  if (statusCode >= 400) return 'border-amber-800/60 bg-amber-950/30 text-amber-300';
  if (statusCode >= 300) return 'border-cyan-800/60 bg-cyan-950/30 text-cyan-300';
  return 'border-emerald-800/60 bg-emerald-950/30 text-emerald-300';
}

function externalActorLabel(log: RequestLogEntry) {
  if (log.apiTokenName) {
    return log.username ? `${log.apiTokenName} (by ${log.username})` : log.apiTokenName;
  }
  if (log.username) {
    return `${log.username} (API Token)`;
  }
  if (log.authMethod === 'admin_key' || log.clientType === 'server_key') {
    return 'System Key';
  }
  return 'anonymous';
}

function ihmActorLabel(log: RequestLogEntry) {
  if (log.internalClient) {
    if (log.internalClient === 'anonymous' || log.internalClient === 'ihm-public-proxy') return 'anonymous';
    return log.internalClient;
  }
  if (log.username && log.username !== 'ihm-public-proxy') {
    return `${log.username}${log.role ? ` · ${log.role}` : ''}`;
  }
  return 'anonymous';
}

function clientLabel(log: RequestLogEntry) {
  if (log.clientType === 'external_api') return 'External API token';
  if (log.clientType === 'internal_web_proxy') return log.internalClient ? `Internal IHM · ${log.internalClient}` : 'Internal IHM proxy';
  if (log.clientType === 'server_key') return 'Server API key';
  if (log.clientType === 'web_session') return 'Web session';
  if (log.clientType === 'anonymous_web') return 'Public web';
  return log.authMethod ?? 'unknown';
}

function projectStatusStyle(status: ApiSupervisionProject['status']) {
  if (status === 'active') return 'border-emerald-800/60 bg-emerald-950/30 text-emerald-300';
  if (status === 'revoked') return 'border-rose-800/60 bg-rose-950/30 text-rose-300';
  return 'border-amber-800/60 bg-amber-950/30 text-amber-300';
}

const STATUS_FAMILY_STYLE: Record<string, string> = {
  '2xx': 'bg-emerald-500/70',
  '3xx': 'bg-cyan-500/70',
  '4xx': 'bg-amber-500/70',
  '5xx': 'bg-rose-500/70',
};

// ── Sub-components ───────────────────────────────────────────────────────────

function ServiceBadge({
  label,
  ok,
  icon: Icon,
  okText = 'ONLINE',
  downText = 'DOWN',
}: {
  label: string;
  ok: boolean | null;
  icon: React.ElementType;
  okText?: string;
  downText?: string;
}) {
  const style = ok === null
    ? 'border-slate-700/50 text-slate-500'
    : ok
      ? 'border-emerald-700/50 bg-emerald-950/30 text-emerald-400'
      : 'border-rose-700/50 bg-rose-950/30 text-rose-400';
  return (
    <div className={`flex items-center gap-2.5 rounded-sm border px-3 py-2.5 ${style}`}>
      <Icon size={14} />
      <span className="font-orbitron text-[10px] font-bold uppercase tracking-widest">{label}</span>
      <span className={`ml-auto h-2 w-2 rounded-full ${ok === null ? 'bg-slate-600' : ok ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
      <span className="font-mono-sc text-[10px]">{ok === null ? 'UNKNOWN' : ok ? okText : downText}</span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 10_000;

export default function AdminMonitoringPage() {
  const { user: me } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'api' | 'system' | 'api-logs' | 'ihm-logs'>('overview');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [externalRequestLogs, setExternalRequestLogs] = useState<RequestLogEntry[]>([]);
  const [webRequestLogs, setWebRequestLogs] = useState<RequestLogEntry[]>([]);
  const [apiSupervision, setApiSupervision] = useState<ApiSupervisionSnapshot | null>(null);
  const [discordBot, setDiscordBot] = useState<DiscordBotStatus | null>(null);
  const [revokingTokenId, setRevokingTokenId] = useState<number | null>(null);
  const [reqPerSec, setReqPerSec] = useState<number | null>(null);
  const [historyRole, setHistoryRole] = useState('');
  const [historyUserId, setHistoryUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const prevRef = useRef<{ total: number; at: number } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [readyRes, cacheRes, metricsRes, discordRes] = await Promise.allSettled([
        fetch('/health/ready'),
        fetch('/health/cache/stats'),
        fetch('/health/metrics'),
        fetch('/api/admin/discord-bot'),
      ]);
      const historyParams = new URLSearchParams({ limit: '80' });
      if (historyRole) historyParams.set('role', historyRole);
      if (historyUserId.trim()) historyParams.set('userId', historyUserId.trim());
      const externalLogsPromise = fetch(`/api/admin/request-logs?scope=external&${historyParams.toString()}`);
      const webLogsPromise = fetch(`/api/admin/request-logs?scope=web&${historyParams.toString()}`);
      const supervisionPromise = fetch('/api/admin/api-supervision');

      const ready: ReadyState | null = readyRes.status === 'fulfilled'
        ? await readyRes.value.json().catch(() => null)
        : null;
      const cache: CacheStats | null = cacheRes.status === 'fulfilled' && cacheRes.value.ok
        ? await cacheRes.value.json().catch(() => null)
        : null;
      const metricsText = metricsRes.status === 'fulfilled' && metricsRes.value.ok
        ? await metricsRes.value.text()
        : '';
      if (discordRes.status === 'fulfilled' && discordRes.value.ok) {
        const discordJson = await discordRes.value.json().catch(() => null);
        setDiscordBot(discordJson?.data ?? null);
      }
      const externalLogsRes = await externalLogsPromise.catch(() => null);
      if (externalLogsRes?.ok) {
        const logsJson = await externalLogsRes.json().catch(() => null);
        setExternalRequestLogs(Array.isArray(logsJson?.data) ? logsJson.data : []);
      }
      const webLogsRes = await webLogsPromise.catch(() => null);
      if (webLogsRes?.ok) {
        const logsJson = await webLogsRes.json().catch(() => null);
        setWebRequestLogs(Array.isArray(logsJson?.data) ? logsJson.data : []);
      }
      const supervisionRes = await supervisionPromise.catch(() => null);
      if (supervisionRes?.ok) {
        const supervisionJson = await supervisionRes.json().catch(() => null);
        setApiSupervision(supervisionJson?.data ?? null);
      }

      if (!ready && !metricsText) {
        setError('API unreachable — all health endpoints failed.');
        setSnapshot(null);
        return;
      }

      const next = buildSnapshot(parsePrometheus(metricsText), ready, cache);
      const prev = prevRef.current;
      if (prev && next.totalRequests >= prev.total && next.fetchedAt > prev.at) {
        setReqPerSec((next.totalRequests - prev.total) / ((next.fetchedAt - prev.at) / 1000));
      }
      prevRef.current = { total: next.totalRequests, at: next.fetchedAt };
      setSnapshot(next);
      setError(null);
    } catch {
      setError('Failed to load monitoring data.');
    } finally {
      setLoading(false);
    }
  }, [historyRole, historyUserId]);

  const revokeApiToken = async (tokenId: number) => {
    setRevokingTokenId(tokenId);
    try {
      const res = await fetch(`/api/admin/api-tokens/${tokenId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Failed to revoke API token');
      await refresh();
    } catch (err: any) {
      setError(err.message ?? 'Failed to revoke API token.');
    } finally {
      setRevokingTokenId(null);
    }
  };

  useEffect(() => {
    if (me?.role !== ADMIN_ROLE) return;
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [me?.role, refresh]);

  if (!me) return <div className="p-6 text-center text-slate-500 font-mono-sc text-sm">Sign in required.</div>;
  if (me.role !== ADMIN_ROLE) {
    return <div className="p-6 text-center text-slate-500 font-mono-sc text-sm">ACCESS DENIED — Admin role required</div>;
  }

  const apiOk = snapshot ? snapshot.ready !== null || snapshot.totalRequests > 0 : null;
  const statusTotal = snapshot ? Object.values(snapshot.statusCounts).reduce((a, b) => a + b, 0) : 0;

  return (
    <PageShell size="lg" className="p-4 md:p-6">
      <PageHeader
        eyebrow="Administration"
        title="Monitoring"
        subtitle="Live service health, traffic and runtime metrics."
        actions={(
          <button
            type="button"
            onClick={() => { setLoading(true); void refresh(); }}
            className="sci-btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Refresh
          </button>
        )}
      />

      <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <Link
          href="/admin"
          className="flex w-fit items-center gap-2 sci-panel border border-slate-800/60 px-3 py-2 text-slate-500 transition-colors hover:border-cyan-800/50 hover:text-cyan-400"
        >
          <ArrowLeft size={13} />
          <span className="font-orbitron text-[10px] uppercase tracking-widest">Back to admin</span>
        </Link>

        {/* Tabs Navigation */}
        <div className="flex flex-wrap border-b border-slate-800/60 font-orbitron text-xs">
          {(
            [
              { id: 'overview', label: 'Vue d\'ensemble' },
              { id: 'api', label: 'Accès & Jetons API' },
              { id: 'system', label: 'Performance & Système' },
              { id: 'api-logs', label: 'Logs API Externe' },
              { id: 'ihm-logs', label: 'Logs IHM' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px border-b-2 px-4 py-2 font-semibold uppercase tracking-wider transition-all duration-150 ${
                activeTab === tab.id
                  ? 'border-cyan-500 text-cyan-400 bg-cyan-950/10 drop-shadow-[0_0_8px_rgba(6,182,212,0.15)]'
                  : 'border-transparent text-slate-500 hover:border-slate-800 hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-sm border border-rose-800/60 bg-rose-950/20 px-3 py-2.5 font-mono-sc text-xs text-rose-400">
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Service health */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <ServiceBadge label="API" ok={apiOk} icon={Server} />
            <ServiceBadge label="PostgreSQL" ok={snapshot?.ready?.checks.database ?? null} icon={Database} />
            <ServiceBadge label="Redis" ok={snapshot?.ready?.checks.redis ?? (snapshot?.cache?.connected ?? null)} icon={Zap} />
            <ServiceBadge
              label="Discord bot"
              ok={discordBot ? discordBot.configured : null}
              icon={Bot}
              okText="CONFIGURED"
              downText="MISSING"
            />
          </div>

          {/* Traffic stats */}
          <StatGrid>
            <StatCard icon={Activity} label="Total requests" value={snapshot ? snapshot.totalRequests.toLocaleString() : '—'} accent="cyan" />
            <StatCard icon={Activity} label="Traffic" value={reqPerSec !== null ? `${reqPerSec.toFixed(1)} req/s` : '—'} accent="emerald" />
            <StatCard icon={Clock} label="Avg latency" value={fmtMs(snapshot?.avgLatencyMs ?? null)} accent="amber" />
            <StatCard icon={AlertTriangle} label="5xx errors" value={snapshot ? snapshot.totalErrors.toLocaleString() : '—'} accent={snapshot && snapshot.totalErrors > 0 ? 'rose' : 'slate'} />
          </StatGrid>

          {/* Status code distribution */}
          {snapshot && statusTotal > 0 && (
            <div className="sci-panel border border-slate-800/60 p-3">
              <p className="mb-2 font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">HTTP status distribution</p>
              <div className="flex h-3 w-full overflow-hidden rounded-sm bg-slate-900">
                {Object.entries(snapshot.statusCounts).sort().map(([family, count]) => (
                  <div
                    key={family}
                    className={STATUS_FAMILY_STYLE[family] ?? 'bg-slate-600'}
                    style={{ width: `${(count / statusTotal) * 100}%` }}
                    title={`${family}: ${count.toLocaleString()}`}
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-3">
                {Object.entries(snapshot.statusCounts).sort().map(([family, count]) => (
                  <span key={family} className="flex items-center gap-1.5 font-mono-sc text-[10px] text-slate-500">
                    <span className={`h-2 w-2 rounded-sm ${STATUS_FAMILY_STYLE[family] ?? 'bg-slate-600'}`} />
                    {family} · {count.toLocaleString()} ({((count / statusTotal) * 100).toFixed(1)}%)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Top routes */}
          <div className="sci-panel border border-slate-800/60">
            <p className="border-b border-slate-800/60 px-3 py-2.5 font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">
              Top routes by traffic
            </p>
            {loading && !snapshot ? (
              <div className="flex items-center justify-center py-10 text-slate-600"><Loader2 size={18} className="animate-spin" /></div>
            ) : !snapshot || snapshot.routes.length === 0 ? (
              <p className="px-3 py-8 text-center font-mono-sc text-xs text-slate-700">No traffic recorded yet.</p>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800/60 font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">
                    <th className="px-3 py-2 font-normal">Route</th>
                    <th className="px-3 py-2 text-right font-normal">Requests</th>
                    <th className="px-3 py-2 text-right font-normal">Avg</th>
                    <th className="px-3 py-2 text-right font-normal">5xx</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.routes.map((r) => (
                    <tr key={r.route} className="border-b border-slate-800/40 last:border-0 hover:bg-cyan-950/10">
                      <td className="max-w-[16rem] truncate px-3 py-2 font-mono-sc text-xs text-slate-300">{r.route}</td>
                      <td className="px-3 py-2 text-right font-mono-sc text-xs text-cyan-400">{r.requests.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono-sc text-xs text-slate-400">{fmtMs(r.avgMs)}</td>
                      <td className={`px-3 py-2 text-right font-mono-sc text-xs ${r.errors > 0 ? 'text-rose-400' : 'text-slate-700'}`}>{r.errors > 0 ? r.errors.toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'api' && apiSupervision && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <StatGrid>
            <StatCard icon={Globe} label="External API 15m" value={apiSupervision.summary.externalApiRequests15m.toLocaleString()} accent="cyan" />
            <StatCard icon={User} label="Active users 15m" value={apiSupervision.summary.activeUsers15m.toLocaleString()} accent="emerald" />
            <StatCard icon={KeyRound} label="Active tokens" value={apiSupervision.summary.activeTokens.toLocaleString()} accent="purple" />
            <StatCard icon={ShieldCheck} label="Connected projects" value={apiSupervision.summary.connectedProjects.toLocaleString()} accent="amber" />
          </StatGrid>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
            <div className="sci-panel border border-slate-800/60">
              <div className="flex flex-col gap-1 border-b border-slate-800/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">External API projects and tokens</p>
                <span className="font-mono-sc text-[9px] uppercase tracking-widest text-slate-700">
                  {apiSupervision.summary.tokensUsed24h.toLocaleString()} used in 24h · {apiSupervision.summary.revokedTokens.toLocaleString()} revoked
                </span>
              </div>
              {apiSupervision.projects.length === 0 ? (
                <p className="px-3 py-8 text-center font-mono-sc text-xs text-slate-700">No generated API tokens yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] text-left">
                    <thead>
                      <tr className="border-b border-slate-800/60 font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">
                        <th className="px-3 py-2 font-normal">Project</th>
                        <th className="px-3 py-2 font-normal">Owner</th>
                        <th className="px-3 py-2 font-normal">Status</th>
                        <th className="px-3 py-2 font-normal">Created</th>
                        <th className="px-3 py-2 font-normal">Expires</th>
                        <th className="px-3 py-2 text-right font-normal">Recent</th>
                        <th className="px-3 py-2 text-right font-normal">Total</th>
                        <th className="px-3 py-2 font-normal">Last used</th>
                        <th className="px-3 py-2 text-right font-normal">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiSupervision.projects.slice(0, 12).map((project) => (
                        <tr key={project.tokenId} className="border-b border-slate-800/40 last:border-0 hover:bg-cyan-950/10">
                          <td className="px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate font-mono-sc text-xs text-slate-300">{project.name}</p>
                              {project.description && <p className="truncate font-rajdhani text-xs text-slate-600">{project.description}</p>}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono-sc text-xs text-slate-500">
                            {project.owner ? `${project.owner.username} · ${project.owner.role}` : 'Unknown'}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-sm border px-1.5 py-0.5 font-mono-sc text-[10px] font-bold uppercase ${projectStatusStyle(project.status)}`}>
                              {project.connected ? 'connected' : project.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono-sc text-xs text-slate-500">{fmtDateTime(project.createdAt)}</td>
                          <td className="px-3 py-2 font-mono-sc text-xs text-slate-500">{fmtDateTime(project.expiresAt)}</td>
                          <td className="px-3 py-2 text-right font-mono-sc text-xs text-cyan-400">{project.recentRequests.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-mono-sc text-xs text-slate-400">{project.usageCount.toLocaleString()}</td>
                          <td className="px-3 py-2 font-mono-sc text-xs text-slate-500">{fmtDateTime(project.lastUsedAt)}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => void revokeApiToken(project.tokenId)}
                              disabled={project.status !== 'active' || revokingTokenId === project.tokenId}
                              className="inline-flex items-center gap-1.5 rounded-sm border border-rose-900/60 px-2 py-1 font-mono-sc text-[10px] text-rose-300 transition-colors hover:border-rose-600 hover:bg-rose-950/30 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              <Trash2 size={11} />
                              {revokingTokenId === project.tokenId ? 'Revoking' : 'Revoke'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="sci-panel border border-slate-800/60">
              <p className="border-b border-slate-800/60 px-3 py-2.5 font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">
                Connected users
              </p>
              {apiSupervision.activeUsers.length === 0 ? (
                <p className="px-3 py-8 text-center font-mono-sc text-xs text-slate-700">No authenticated user activity in the last 15 minutes.</p>
              ) : (
                <div className="divide-y divide-slate-800/50">
                  {apiSupervision.activeUsers.slice(0, 10).map((user) => (
                    <div key={user.userId} className="px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate font-mono-sc text-xs text-slate-300">{user.username ?? `user #${user.userId}`}</p>
                        <span className="font-mono-sc text-[10px] text-slate-600">{fmtDateTime(user.lastSeenAt)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 font-mono-sc text-[10px] text-slate-600">
                        <span>{user.role ?? 'user'}</span>
                        <span>{user.requestCount.toLocaleString()} req</span>
                        <span>{user.externalApiRequests.toLocaleString()} external</span>
                        <span>{user.webRequests.toLocaleString()} web</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'system' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Runtime stats */}
          <StatGrid>
            <StatCard icon={Clock} label="Uptime" value={fmtUptime(snapshot?.uptimeSeconds ?? null)} accent="cyan" />
            <StatCard icon={HardDrive} label="Memory (RSS)" value={fmtBytes(snapshot?.memoryBytes ?? null)} accent="purple" />
            <StatCard icon={Cpu} label="Heap used" value={fmtBytes(snapshot?.heapUsedBytes ?? null)} accent="purple" />
            <StatCard icon={Gauge} label="Event loop lag" value={fmtMs(snapshot?.eventLoopLagMs ?? null)} accent={snapshot?.eventLoopLagMs != null && snapshot.eventLoopLagMs > 50 ? 'rose' : 'slate'} />
          </StatGrid>

          {/* Cache stats */}
          <StatGrid>
            <StatCard icon={Zap} label="Cache hits" value={snapshot?.cache ? snapshot.cache.hits.toLocaleString() : '—'} accent="emerald" />
            <StatCard icon={Zap} label="Cache misses" value={snapshot?.cache ? snapshot.cache.misses.toLocaleString() : '—'} accent="slate" />
            <StatCard icon={Gauge} label="Hit rate" value={snapshot?.cache ? `${snapshot.cache.hitRate}%` : '—'} accent="cyan" />
            <StatCard icon={Zap} label="Redis link" value={snapshot?.cache ? (snapshot.cache.connected ? 'CONNECTED' : 'OFFLINE') : '—'} accent={snapshot?.cache?.connected ? 'emerald' : 'rose'} />
          </StatGrid>

          <div className="sci-panel border border-slate-800/60 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">
                  <Bot size={12} className="text-cyan-500" /> Discord bot
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  {discordBot?.configured
                    ? `${discordBot.commandCount} slash commands configured.`
                    : 'Invite link not configured. Set NEXT_PUBLIC_DISCORD_CLIENT_ID or DISCORD_CLIENT_ID.'}
                </p>
                {discordBot?.clientId && (
                  <p className="mt-1 font-mono-sc text-[10px] text-slate-600">Client ID {discordBot.clientId}</p>
                )}
                {discordBot?.guildId && (
                  <p className="mt-1 font-mono-sc text-[10px] text-slate-600">Community server {discordBot.guildId}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/discord" className="rounded-sm border border-slate-800 px-3 py-2 font-mono-sc text-xs text-slate-400 hover:border-cyan-800/70 hover:text-cyan-300">
                  Command help
                </Link>
                {discordBot?.serverInviteUrl && (
                  <a href={discordBot.serverInviteUrl} target="_blank" rel="noreferrer" className="rounded-sm border border-cyan-900/70 px-3 py-2 font-mono-sc text-xs text-cyan-300 hover:border-cyan-500 hover:text-cyan-100">
                    Join server
                  </a>
                )}
                {discordBot?.inviteUrl && (
                  <a href={discordBot.inviteUrl} target="_blank" rel="noreferrer" className="sci-btn-primary px-3 py-2 text-xs">
                    Invite bot
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'api-logs' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="sci-panel border border-slate-800/60 p-3">
            <div className="grid gap-3 md:grid-cols-[1fr_180px_160px] md:items-end">
              <div>
                <p className="font-orbitron text-sm font-bold uppercase tracking-widest text-slate-200">External API History</p>
                <p className="mt-1 font-mono-sc text-xs text-slate-600">
                  Persistent API activity from external developers and apps.
                </p>
              </div>
              <label className="block">
                <span className="mb-1 block font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">Role</span>
                <select value={historyRole} onChange={(event) => setHistoryRole(event.target.value)} className="sci-input h-9 w-full text-xs">
                  <option value="">All roles</option>
                  <option value="user">User</option>
                  <option value="developer">Developer</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">User ID</span>
                <input
                  value={historyUserId}
                  onChange={(event) => setHistoryUserId(event.target.value.replace(/\D/g, ''))}
                  placeholder="Any"
                  className="sci-input h-9 w-full text-xs"
                />
              </label>
            </div>
          </div>

          <div className="sci-panel border border-slate-800/60">
            <div className="flex flex-col gap-1 border-b border-slate-800/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">
                External API logs
              </p>
              <span className="font-mono-sc text-[9px] uppercase tracking-widest text-slate-700">
                Last {externalRequestLogs.length.toLocaleString()} requests
              </span>
            </div>
            {loading && externalRequestLogs.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-slate-600"><Loader2 size={18} className="animate-spin" /></div>
            ) : externalRequestLogs.length === 0 ? (
              <p className="px-3 py-8 text-center font-mono-sc text-xs text-slate-700">No external API logs yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-800/60 font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">
                      <th className="px-3 py-2 font-normal">Time</th>
                      <th className="px-3 py-2 font-normal">Request</th>
                      <th className="px-3 py-2 text-right font-normal">Status</th>
                      <th className="px-3 py-2 text-right font-normal">Duration</th>
                      <th className="px-3 py-2 font-normal">IP Address</th>
                      <th className="px-3 py-2 font-normal">Project / Actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {externalRequestLogs.map((log) => (
                      <tr key={log.id} className="border-b border-slate-800/40 last:border-0 hover:bg-cyan-950/10 transition-colors">
                        <td className="whitespace-nowrap px-3 py-2 font-mono-sc text-xs text-slate-500">{fmtTime(log.timestamp)}</td>
                        <td className="px-3 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="rounded-sm border border-cyan-900/60 bg-cyan-950/20 px-1.5 py-0.5 font-mono-sc text-[10px] font-bold text-cyan-400">
                              {log.method}
                            </span>
                            <span className="max-w-md truncate font-mono-sc text-xs text-slate-300" title={log.path}>{log.path}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={`inline-flex rounded-sm border px-1.5 py-0.5 font-mono-sc text-[10px] font-bold ${statusStyle(log.statusCode)}`}>
                            {log.statusCode}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono-sc text-xs text-slate-400">{fmtMs(log.durationMs)}</td>
                        <td className="px-3 py-2 font-mono-sc text-xs text-slate-500">
                          {log.ip ?? 'unknown'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 font-mono-sc text-xs text-slate-500" title={clientLabel(log)}>
                            <KeyRound size={11} className="text-slate-600" />
                            <span className="max-w-[12rem] truncate">{externalActorLabel(log)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'ihm-logs' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="sci-panel border border-slate-800/60 p-3">
            <div className="grid gap-3 md:grid-cols-[1fr_180px_160px] md:items-end">
              <div>
                <p className="font-orbitron text-sm font-bold uppercase tracking-widest text-slate-200">Starvis IHM History</p>
                <p className="mt-1 font-mono-sc text-xs text-slate-600">
                  User requests performed from the frontend application.
                </p>
              </div>
              <label className="block">
                <span className="mb-1 block font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">Role</span>
                <select value={historyRole} onChange={(event) => setHistoryRole(event.target.value)} className="sci-input h-9 w-full text-xs">
                  <option value="">All roles</option>
                  <option value="user">User</option>
                  <option value="developer">Developer</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">User ID</span>
                <input
                  value={historyUserId}
                  onChange={(event) => setHistoryUserId(event.target.value.replace(/\D/g, ''))}
                  placeholder="Any"
                  className="sci-input h-9 w-full text-xs"
                />
              </label>
            </div>
          </div>

          <div className="sci-panel border border-slate-800/60">
            <div className="flex flex-col gap-1 border-b border-slate-800/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">
                Starvis IHM logs
              </p>
              <span className="font-mono-sc text-[9px] uppercase tracking-widest text-slate-700">
                Last {webRequestLogs.length.toLocaleString()} web requests
              </span>
            </div>
            {loading && webRequestLogs.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-slate-600"><Loader2 size={18} className="animate-spin" /></div>
            ) : webRequestLogs.length === 0 ? (
              <p className="px-3 py-8 text-center font-mono-sc text-xs text-slate-700">No Starvis IHM request logs yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-800/60 font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">
                      <th className="px-3 py-2 font-normal">Time</th>
                      <th className="px-3 py-2 font-normal">Request</th>
                      <th className="px-3 py-2 text-right font-normal">Status</th>
                      <th className="px-3 py-2 text-right font-normal">Duration</th>
                      <th className="px-3 py-2 font-normal">IP Address</th>
                      <th className="px-3 py-2 font-normal">Actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webRequestLogs.map((log) => (
                      <tr key={log.id} className="border-b border-slate-800/40 last:border-0 hover:bg-cyan-950/10 transition-colors">
                        <td className="whitespace-nowrap px-3 py-2 font-mono-sc text-xs text-slate-500">{fmtTime(log.timestamp)}</td>
                        <td className="px-3 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="rounded-sm border border-cyan-900/60 bg-cyan-950/20 px-1.5 py-0.5 font-mono-sc text-[10px] font-bold text-cyan-400">
                              {log.method}
                            </span>
                            <span className="max-w-md truncate font-mono-sc text-xs text-slate-300" title={log.path}>{log.path}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={`inline-flex rounded-sm border px-1.5 py-0.5 font-mono-sc text-[10px] font-bold ${statusStyle(log.statusCode)}`}>
                            {log.statusCode}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono-sc text-xs text-slate-400">{fmtMs(log.durationMs)}</td>
                        <td className="px-3 py-2 font-mono-sc text-xs text-slate-500">
                          {log.ip ?? 'unknown'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 font-mono-sc text-xs text-slate-500" title={clientLabel(log)}>
                            <User size={11} className="text-slate-600" />
                            <span className="max-w-[12rem] truncate">{ihmActorLabel(log)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="font-mono-sc text-[10px] text-slate-700">
        Auto-refresh every {REFRESH_INTERVAL_MS / 1000}s · counters since last API restart
        {snapshot ? ` · updated ${new Date(snapshot.fetchedAt).toLocaleTimeString()}` : ''}
      </p>
    </PageShell>
  );
}
