/**
 * HistoryPage — Patch history grouped by game version
 * Inspired by starcitizen.tools changelog
 */
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Clock, ChevronDown, ChevronRight, Package, Settings2, Dices, Plus, Minus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/services/api';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { fDateTime } from '@/utils/formatters';
import type { ChangelogEntry } from '@/types/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ENTITY_ICON: Record<string, React.ElementType> = {
  ship: Package,
  component: Settings2,
  item: Dices,
};

const CHANGE_COLOR: Record<string, string> = {
  added: 'green',
  removed: 'red',
  modified: 'amber',
};

const CHANGE_ICON: Record<string, React.ElementType> = {
  added: Plus,
  removed: Minus,
  modified: RefreshCw,
};

function groupByVersion(entries: ChangelogEntry[]): Map<string, ChangelogEntry[]> {
  const map = new Map<string, ChangelogEntry[]>();
  for (const e of entries) {
    const v = e.game_version ?? 'Unknown version';
    if (!map.has(v)) map.set(v, []);
    map.get(v)!.push(e);
  }
  return map;
}

function groupByEntity(entries: ChangelogEntry[]): Map<string, ChangelogEntry[]> {
  const map = new Map<string, ChangelogEntry[]>();
  for (const e of entries) {
    const key = `${e.entity_type}:${e.entity_uuid}:${e.entity_name}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return map;
}

// ── EntityCard ───────────────────────────────────────────────────────────────

function EntityCard({ entityKey, entries }: { entityKey: string; entries: ChangelogEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const [type, , name] = entityKey.split(':');
  const Icon = ENTITY_ICON[type] ?? Package;

  // Link to entity detail if available
  const uuid = entries[0]?.entity_uuid;
  const entityLink = type === 'ship' ? `/ships/${uuid}` :
                     type === 'component' ? `/components/${uuid}` :
                     type === 'item' ? `/items/${uuid}` : null;

  return (
    <div className="border border-slate-800 rounded overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.02] transition-colors text-left"
      >
        <Icon size={13} className="text-slate-600 shrink-0" />
        <div className="flex-1 min-w-0">
          {entityLink ? (
            <Link
              to={entityLink}
              className="text-xs font-rajdhani font-semibold text-cyan-400 hover:text-cyan-300 transition-colors truncate block"
              onClick={e => e.stopPropagation()}
            >
              {name}
            </Link>
          ) : (
            <span className="text-xs font-rajdhani font-semibold text-slate-200 truncate block">{name}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {['added', 'removed', 'modified'].map(ct => {
            const count = entries.filter(e => e.change_type === ct).length;
            if (!count) return null;
            return (
              <GlowBadge key={ct} color={CHANGE_COLOR[ct] as 'green' | 'red' | 'amber'} size="xs">
                {count}
              </GlowBadge>
            );
          })}
        </div>
        {expanded ? <ChevronDown size={12} className="text-slate-600" /> : <ChevronRight size={12} className="text-slate-600" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-900 bg-slate-950/30">
          {entries.map((entry, i) => {
            const ChangeIcon = CHANGE_ICON[entry.change_type] ?? RefreshCw;
            return (
              <div key={entry.id} className={`flex items-start gap-3 px-3 py-2 text-xs ${i > 0 ? 'border-t border-slate-900/50' : ''}`}>
                <ChangeIcon size={11} className={
                  entry.change_type === 'added' ? 'text-green-500 mt-0.5 shrink-0' :
                  entry.change_type === 'removed' ? 'text-red-500 mt-0.5 shrink-0' :
                  'text-amber-500 mt-0.5 shrink-0'
                } />
                <div className="flex-1 min-w-0">
                  {entry.field_name && (
                    <span className="font-mono-sc text-slate-500 mr-1">{entry.field_name}:</span>
                  )}
                  {entry.change_type === 'modified' && entry.old_value && entry.new_value ? (
                    <span className="text-slate-400">
                      <span className="text-red-400 line-through">{entry.old_value}</span>
                      {' → '}
                      <span className="text-green-400">{entry.new_value}</span>
                    </span>
                  ) : entry.new_value ? (
                    <span className="text-slate-300">{entry.new_value}</span>
                  ) : (
                    <span className="italic text-slate-600">{entry.change_type}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── VersionSection ───────────────────────────────────────────────────────────

function VersionSection({ version, entries }: { version: string; entries: ChangelogEntry[] }) {
  const [open, setOpen] = useState(true);
  const grouped = groupByEntity(entries);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-900/60 border border-slate-800 rounded hover:border-slate-700 transition-all text-left"
      >
        <div className="flex-1">
          <span className="font-orbitron text-sm text-cyan-400">{version}</span>
          <span className="ml-3 font-mono-sc text-xs text-slate-600">
            {entries.length} change{entries.length > 1 ? 's' : ''} · {grouped.size} entit{grouped.size > 1 ? 'ies' : 'y'}
          </span>
        </div>
        {open ? <ChevronDown size={14} className="text-slate-600" /> : <ChevronRight size={14} className="text-slate-600" />}
      </button>
      {open && (
        <div className="space-y-1.5 pl-4">
          {[...grouped.entries()].map(([key, ents]) => (
            <EntityCard key={key} entityKey={key} entries={ents} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const ENTITY_TYPES = ['', 'ship', 'component', 'item', 'commodity', 'paint'];
const CHANGE_TYPES = ['', 'added', 'removed', 'modified'];

export default function HistoryPage() {
  const [entityType, setEntityType] = useState('ship');
  const [changeType, setChangeType] = useState('');

  const { data: summary } = useQuery({
    queryKey: ['changelog.summary'],
    queryFn: api.changelog.summary,
    staleTime: 5 * 60_000,
  });

  // Load a large batch to group by version — no pagination needed here
  const { data, isLoading } = useQuery({
    queryKey: ['changelog.history', entityType, changeType],
    queryFn: () => api.changelog.list({
      limit: 1000,
      offset: 0,
      entity_type: entityType || undefined,
      change_type: changeType || undefined,
    }),
    staleTime: 5 * 60_000,
  });

  const grouped = data ? groupByVersion(data.data) : new Map<string, ChangelogEntry[]>();

  return (
    <div className="max-w-screen-xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase flex items-center gap-2">
          <Clock size={18} />
          Patch History
        </h1>
        {summary && (
          <p className="text-xs text-slate-500 mt-0.5 font-mono-sc">
            {summary.total.toLocaleString('en-US')} total changes
            {summary.last_extraction && ` · Last update: ${fDateTime(summary.last_extraction)}`}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Entity type */}
        <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800 rounded p-1">
          {ENTITY_TYPES.map(t => (
            <button
              key={t || 'all'}
              onClick={() => setEntityType(t)}
              className={`px-2.5 py-1 rounded text-[10px] font-mono-sc uppercase transition-all ${
                entityType === t
                  ? 'bg-cyan-900/60 text-cyan-400 border border-cyan-800'
                  : 'text-slate-600 hover:text-slate-400'
              }`}
            >
              {t || 'All'}
            </button>
          ))}
        </div>
        {/* Change type */}
        <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800 rounded p-1">
          {CHANGE_TYPES.map(t => (
            <button
              key={t || 'all'}
              onClick={() => setChangeType(t)}
              className={`px-2.5 py-1 rounded text-[10px] font-mono-sc uppercase transition-all ${
                changeType === t
                  ? t === 'added' ? 'bg-green-900/40 text-green-400 border border-green-800' :
                    t === 'removed' ? 'bg-red-900/40 text-red-400 border border-red-800' :
                    t === 'modified' ? 'bg-amber-900/40 text-amber-400 border border-amber-800' :
                    'bg-cyan-900/60 text-cyan-400 border border-cyan-800'
                  : 'text-slate-600 hover:text-slate-400'
              }`}
            >
              {t || 'All changes'}
            </button>
          ))}
        </div>
        {data && (
          <span className="text-xs text-slate-600 font-mono-sc ml-auto">
            {data.data.length.toLocaleString('en-US')} results · {grouped.size} versions
          </span>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingGrid message="LOADING HISTORY…" />
      ) : grouped.size === 0 ? (
        <div className="text-center py-16 text-slate-600 text-sm font-rajdhani">
          No changes found for the selected filters
        </div>
      ) : (
        <div className="space-y-3">
          {[...grouped.entries()].map(([version, entries]) => (
            <VersionSection key={version} version={version} entries={entries} />
          ))}
        </div>
      )}
    </div>
  );
}
