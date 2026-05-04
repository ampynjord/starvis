import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Dices,
  Layers,
  List,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Settings2,
  ShoppingBag,
} from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { useEnv } from '@/contexts/EnvContext';
import { api } from '@/services/api';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { fDate, fDateTime } from '@/utils/formatters';
import type { ChangelogEntry } from '@/types/api';

// ── Config ────────────────────────────────────────────────────────────────────

const HISTORY_LIMIT = 1000;
const FEED_LIMIT = 40;
const AUTO_EXPAND_MAX = 4;

type ChangeType = 'added' | 'removed' | 'modified';

const CHANGE_CFG: Record<ChangeType, { color: 'green' | 'red' | 'amber'; icon: typeof Plus; sign: string }> = {
  added:    { color: 'green', icon: Plus,      sign: '+' },
  removed:  { color: 'red',   icon: Minus,     sign: '-' },
  modified: { color: 'amber', icon: RefreshCw, sign: '~' },
};

function EntityIcon({ type }: { type: string }) {
  if (type === 'ship')      return <Package   size={12} className="text-cyan-600   shrink-0" />;
  if (type === 'component') return <Cpu       size={12} className="text-blue-500   shrink-0" />;
  if (type === 'item')      return <Dices     size={12} className="text-purple-500 shrink-0" />;
  if (type === 'commodity') return <ShoppingBag size={12} className="text-yellow-600 shrink-0" />;
  if (type === 'paint')     return <Layers    size={12} className="text-pink-500   shrink-0" />;
  if (type === 'shop')      return <Settings2 size={12} className="text-slate-500  shrink-0" />;
  return <Package size={12} className="text-slate-600 shrink-0" />;
}

function entityHref(type: string, uuid: string): string | null {
  if (type === 'ship')      return `/ships/${uuid}`;
  if (type === 'component') return `/components/${uuid}`;
  if (type === 'item')      return `/items/${uuid}`;
  return null;
}

// ── Grouping ──────────────────────────────────────────────────────────────────

function groupByVersion(entries: ChangelogEntry[]): Map<string, ChangelogEntry[]> {
  const map = new Map<string, ChangelogEntry[]>();
  for (const e of entries) {
    const v = e.game_version ?? 'Unknown';
    if (!map.has(v)) map.set(v, []);
    map.get(v)!.push(e);
  }
  return map;
}

function groupByEntity(entries: ChangelogEntry[]): Map<string, ChangelogEntry[]> {
  const map = new Map<string, ChangelogEntry[]>();
  for (const e of entries) {
    const key = `${e.entity_type}\0${e.entity_uuid}\0${e.entity_name}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return map;
}

// ── Diff row ──────────────────────────────────────────────────────────────────

function DiffRow({ entry, border }: { entry: ChangelogEntry; border: boolean }) {
  const cfg = CHANGE_CFG[entry.change_type as ChangeType];
  const Icon = cfg?.icon ?? RefreshCw;
  const iconColor =
    entry.change_type === 'added'   ? 'text-green-500' :
    entry.change_type === 'removed' ? 'text-red-500'   : 'text-amber-500';

  return (
    <div className={`flex items-baseline gap-3 px-4 py-1.5 text-xs ${border ? 'border-t border-slate-900/70' : ''}`}>
      <Icon size={10} className={`${iconColor} shrink-0 mt-0.5`} />

      {entry.field_name ? (
        <span className="font-mono-sc text-slate-500 shrink-0 w-36 truncate">{entry.field_name}</span>
      ) : (
        <span className="font-mono-sc italic text-slate-700 shrink-0 w-36">—</span>
      )}

      {entry.change_type === 'modified' && entry.old_value != null && entry.new_value != null ? (
        <span className="flex items-baseline gap-1.5 flex-1 min-w-0">
          <span className="text-red-400 line-through max-w-[120px] truncate">{entry.old_value}</span>
          <span className="text-slate-600">→</span>
          <span className="text-green-400 max-w-[120px] truncate">{entry.new_value}</span>
        </span>
      ) : entry.new_value != null ? (
        <span className="text-green-400 flex-1 truncate">{entry.new_value}</span>
      ) : entry.old_value != null ? (
        <span className="text-red-400 line-through flex-1 truncate">{entry.old_value}</span>
      ) : (
        <GlowBadge color={cfg?.color ?? 'slate'} size="xs">{entry.change_type}</GlowBadge>
      )}
    </div>
  );
}

// ── Entity card ───────────────────────────────────────────────────────────────

function EntityCard({ entityKey, entries }: { entityKey: string; entries: ChangelogEntry[] }) {
  const [type, uuid = '', name = ''] = entityKey.split('\0');
  const href = entityHref(type, uuid);

  // Separate marker rows (entity-level) from detail rows (field-level)
  const markerEntries = entries.filter((e) => e.field_name == null);
  const detailEntries = entries.filter((e) => e.field_name != null);

  // Badge counts: +/- from markers (1 per entity), ~ from detail rows
  const isAdded   = markerEntries.some((e) => e.change_type === 'added');
  const isRemoved = markerEntries.some((e) => e.change_type === 'removed');
  const modifiedCount = detailEntries.filter((e) => e.change_type === 'modified').length;

  // Show detail rows when available; fall back to marker rows for old data
  const displayEntries = detailEntries.length > 0 ? detailEntries : markerEntries;
  const [expanded, setExpanded] = useState(displayEntries.length <= AUTO_EXPAND_MAX);

  return (
    <div className="border-t border-slate-800/50">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-white/[0.02] transition-colors text-left"
      >
        <EntityIcon type={type} />

        <div className="flex-1 min-w-0">
          {href ? (
            <Link
              href={href}
              className="text-xs font-rajdhani font-semibold text-cyan-400 hover:text-cyan-300 transition-colors truncate block"
              onClick={(e) => e.stopPropagation()}
            >
              {name}
            </Link>
          ) : (
            <span className="text-xs font-rajdhani font-semibold text-slate-300 truncate block">{name}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isAdded    && <GlowBadge color="green" size="xs">+1</GlowBadge>}
          {isRemoved  && <GlowBadge color="red"   size="xs">-1</GlowBadge>}
          {modifiedCount > 0 && <GlowBadge color="amber" size="xs">~{modifiedCount}</GlowBadge>}
          {detailEntries.length > 0 && (
            <span className="text-[10px] font-mono-sc text-slate-700 ml-0.5">{detailEntries.length} fields</span>
          )}
        </div>

        {expanded
          ? <ChevronDown  size={11} className="text-slate-700 shrink-0" />
          : <ChevronRight size={11} className="text-slate-700 shrink-0" />}
      </button>

      {expanded && (
        <div className="bg-black/20 pb-1">
          {displayEntries.map((entry, i) => (
            <DiffRow key={entry.id} entry={entry} border={i > 0} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Version section ───────────────────────────────────────────────────────────

function VersionSection({ version, entries }: { version: string; entries: ChangelogEntry[] }) {
  const [open, setOpen] = useState(true);
  const grouped = groupByEntity(entries);

  // Count entity-level stats (not row-level) so field-detail rows don't inflate counts
  const byChange = { added: 0, removed: 0, modified: 0 };
  const byType: Record<string, number> = {};
  for (const [, ents] of grouped) {
    const entityType = ents[0]?.entity_type ?? '';
    byType[entityType] = (byType[entityType] ?? 0) + 1;
    const marker = ents.find((e) => e.field_name == null);
    const hasModified = ents.some((e) => e.change_type === 'modified');
    if (marker?.change_type === 'added') byChange.added++;
    else if (marker?.change_type === 'removed') byChange.removed++;
    else if (hasModified) byChange.modified++;
  }

  const date = entries[0]?.created_at;

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded border border-slate-800 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 bg-slate-900/80 hover:bg-slate-900/50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Version + date */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-orbitron text-sm font-bold text-cyan-400">SC {version}</span>
            {date && (
              <span className="font-mono-sc text-xs text-slate-500 flex items-center gap-1">
                <Clock size={10} /> {fDate(date)}
              </span>
            )}
            <span className="font-mono-sc text-xs text-slate-600">
              {grouped.size} {grouped.size === 1 ? 'entity' : 'entities'}
            </span>
          </div>

          {/* Entity type breakdown + change counts */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {Object.entries(byType)
              .sort(([, a], [, b]) => b - a)
              .map(([t, n]) => (
                <span key={t} className="flex items-center gap-1 text-[10px] font-mono-sc text-slate-500">
                  <EntityIcon type={t} />
                  {n} {t}
                </span>
              ))}
            <span className="text-slate-800 hidden sm:inline">·</span>
            {byChange.added    > 0 && <GlowBadge color="green" size="xs">+{byChange.added} added</GlowBadge>}
            {byChange.removed  > 0 && <GlowBadge color="red"   size="xs">-{byChange.removed} removed</GlowBadge>}
            {byChange.modified > 0 && <GlowBadge color="amber" size="xs">~{byChange.modified} modified</GlowBadge>}
          </div>
        </div>

        {open
          ? <ChevronDown  size={14} className="text-slate-600 mt-1 shrink-0" />
          : <ChevronRight size={14} className="text-slate-600 mt-1 shrink-0" />}
      </button>

      {open && (
        <div className="bg-slate-950/30">
          {[...grouped.entries()].map(([key, ents]) => (
            <EntityCard key={key} entityKey={key} entries={ents} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── Feed row ──────────────────────────────────────────────────────────────────

function FeedRow({ entry }: { entry: ChangelogEntry }) {
  const cfg = CHANGE_CFG[entry.change_type as ChangeType];
  const href = entityHref(entry.entity_type, entry.entity_uuid);

  return (
    <div className="sci-panel px-4 py-2.5 flex items-start gap-3">
      {/* Change badge */}
      <GlowBadge color={cfg?.color ?? 'slate'} size="xs" className="shrink-0 mt-0.5 w-5 text-center">
        {cfg?.sign ?? entry.change_type[0]}
      </GlowBadge>

      {/* Entity icon */}
      <span className="mt-0.5 shrink-0">
        <EntityIcon type={entry.entity_type} />
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          {href ? (
            <Link href={href} className="text-sm font-rajdhani font-semibold text-cyan-400 hover:text-cyan-300 transition-colors">
              {entry.entity_name}
            </Link>
          ) : (
            <span className="text-sm font-rajdhani font-semibold text-slate-300">{entry.entity_name}</span>
          )}
          <GlowBadge color="slate" size="xs">{entry.entity_type}</GlowBadge>
        </div>

        {/* Inline diff */}
        {(entry.field_name || entry.old_value || entry.new_value) && (
          <div className="flex items-baseline gap-1.5 mt-0.5 text-xs">
            {entry.field_name && (
              <span className="font-mono-sc text-slate-500">{entry.field_name}:</span>
            )}
            {entry.change_type === 'modified' && entry.old_value != null && entry.new_value != null ? (
              <>
                <span className="text-red-400 line-through">{entry.old_value}</span>
                <span className="text-slate-600">→</span>
                <span className="text-green-400">{entry.new_value}</span>
              </>
            ) : entry.new_value != null ? (
              <span className="text-green-400">{entry.new_value}</span>
            ) : entry.old_value != null ? (
              <span className="text-red-400 line-through">{entry.old_value}</span>
            ) : null}
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="shrink-0 text-right hidden md:block">
        {entry.game_version && (
          <div className="text-[10px] font-mono-sc text-slate-600">SC {entry.game_version}</div>
        )}
        <div className="text-[10px] font-mono-sc text-slate-700">{fDate(entry.created_at)}</div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

type View = 'history' | 'feed';

export default function ChangelogPage() {
  const { env } = useEnv();
  const [view, setView] = useState<View>('history');
  const [entityType, setEntityType] = useState('');
  const [changeType, setChangeType] = useState('');
  const [page, setPage] = useState(1);

  function toggleEntity(t: string) {
    setEntityType((prev) => (prev === t ? '' : t));
    setPage(1);
  }
  function toggleChange(t: string) {
    setChangeType((prev) => (prev === t ? '' : t));
    setPage(1);
  }

  const { data: summary } = useQuery({
    queryKey: ['changelog.summary', env],
    queryFn: () => api.changelog.summary(env),
    staleTime: 5 * 60_000,
  });

  const feedQuery = useQuery({
    queryKey: ['changelog.feed', env, page, entityType, changeType],
    queryFn: () =>
      api.changelog.list({
        env,
        limit: FEED_LIMIT,
        offset: (page - 1) * FEED_LIMIT,
        entity_type: entityType || undefined,
        change_type: changeType || undefined,
        markers_only: true,
      }),
    enabled: view === 'feed',
  });

  const historyQuery = useQuery({
    queryKey: ['changelog.history', env, entityType, changeType],
    queryFn: () =>
      api.changelog.list({
        env,
        limit: HISTORY_LIMIT,
        offset: 0,
        entity_type: entityType || undefined,
        change_type: changeType || undefined,
      }),
    staleTime: 5 * 60_000,
    enabled: view === 'history',
  });

  const totalPages = feedQuery.data ? Math.ceil(feedQuery.data.total / FEED_LIMIT) : 0;
  const grouped = historyQuery.data ? groupByVersion(historyQuery.data.data) : new Map<string, ChangelogEntry[]>();
  const hasFilters = !!(entityType || changeType);

  return (
    <div className="max-w-(--breakpoint-2xl) mx-auto space-y-5">
      <PageHeader
        title="Changelog"
        subtitle={summary ? `${summary.total.toLocaleString('en-US')} total entries${summary.last_extraction ? ` · Last extraction: ${fDateTime(summary.last_extraction)}` : ''}` : undefined}
        actions={
          <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800 rounded-sm p-1">
            <button
              onClick={() => setView('history')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono-sc uppercase transition-all ${
                view === 'history' ? 'bg-cyan-900/60 text-cyan-400 border border-cyan-800' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <ChevronRight size={12} /> By Version
            </button>
            <button
              onClick={() => setView('feed')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono-sc uppercase transition-all ${
                view === 'feed' ? 'bg-cyan-900/60 text-cyan-400 border border-cyan-800' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <List size={12} /> Feed
            </button>
          </div>
        }
      />

      {/* ── Stats / filter bar ───────────────────────────────────────────── */}
      {summary && (
        <div className="sci-panel px-4 py-3 space-y-2.5">
          {/* By entity type */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {Object.entries(summary.by_entity)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([t, n]) => (
                <button
                  key={t}
                  onClick={() => toggleEntity(t)}
                  className={`flex items-center gap-1.5 text-xs font-mono-sc transition-colors ${
                    entityType === t ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <EntityIcon type={t} />
                  <span className="capitalize">{t}</span>
                  <span className={entityType === t ? 'text-cyan-300 font-semibold' : 'text-slate-600'}>
                    {(n as number).toLocaleString('en-US')}
                  </span>
                </button>
              ))}
          </div>

          <div className="border-t border-slate-800/60" />

          {/* By change type */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {Object.entries(summary.by_change).map(([t, n]) => {
              const cfg = CHANGE_CFG[t as ChangeType];
              return (
                <button
                  key={t}
                  onClick={() => toggleChange(t)}
                  className={`flex items-center gap-2 text-xs font-mono-sc transition-colors ${
                    changeType === t ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <GlowBadge color={changeType === t ? 'cyan' : (cfg?.color ?? 'slate')} size="xs">
                    {cfg?.sign ?? t[0]} {t}
                  </GlowBadge>
                  <span className={changeType === t ? 'text-cyan-300 font-semibold' : 'text-slate-600'}>
                    {(n as number).toLocaleString('en-US')}
                  </span>
                </button>
              );
            })}

            {hasFilters && (
              <button
                onClick={() => { setEntityType(''); setChangeType(''); setPage(1); }}
                className="ml-auto text-xs font-mono-sc text-slate-600 hover:text-slate-400 transition-colors underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── History view ─────────────────────────────────────────────────── */}
      {view === 'history' && (
        <>
          {historyQuery.data && (
            <div className="flex items-center justify-between text-xs font-mono-sc text-slate-600">
              <span>
                {historyQuery.data.data.length.toLocaleString('en-US')} entries · {grouped.size}{' '}
                {grouped.size === 1 ? 'version' : 'versions'}
              </span>
              {historyQuery.data.total > HISTORY_LIMIT && (
                <span className="text-amber-600">
                  Showing first {HISTORY_LIMIT.toLocaleString('en-US')} of {historyQuery.data.total.toLocaleString('en-US')} — apply a filter to narrow
                </span>
              )}
            </div>
          )}

          {historyQuery.isLoading ? (
            <LoadingGrid message="LOADING HISTORY…" />
          ) : historyQuery.error ? (
            <ErrorState error={historyQuery.error as Error} onRetry={() => void historyQuery.refetch()} />
          ) : grouped.size === 0 ? (
            <div className="text-center py-16 text-slate-600 text-sm font-rajdhani">No changes found for the selected filters</div>
          ) : (
            <div className="space-y-2">
              {[...grouped.entries()].map(([version, entries]) => (
                <VersionSection key={version} version={version} entries={entries} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Feed view ───────────────────────────────────────────────────── */}
      {view === 'feed' && (
        <>
          {feedQuery.isLoading ? (
            <LoadingGrid message="LOADING FEED…" />
          ) : feedQuery.error ? (
            <ErrorState error={feedQuery.error as Error} onRetry={() => void feedQuery.refetch()} />
          ) : (
            <>
              {feedQuery.data && (
                <div className="text-xs font-mono-sc text-slate-600">
                  {feedQuery.data.total.toLocaleString('en-US')} entries
                </div>
              )}
              <div className="space-y-1.5">
                {feedQuery.data?.data.map((entry, i) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.015, 0.3) }}
                  >
                    <FeedRow entry={entry} />
                  </motion.div>
                ))}
              </div>
              <Pagination
                className="mt-6"
                page={page}
                totalPages={totalPages}
                onPageChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
