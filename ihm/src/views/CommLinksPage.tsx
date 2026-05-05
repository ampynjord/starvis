'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Calendar,
  ExternalLink,
  Newspaper,
  Tag,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { CommLink } from '@/types/api';
import { api } from '@/services/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { useDebounce } from '@/hooks/useDebounce';

const LIMIT = 30;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// ── Category color map ────────────────────────────────────────────────────────

type BadgeColor = 'cyan' | 'amber' | 'green' | 'purple' | 'slate';

const CATEGORY_COLORS: Record<string, BadgeColor> = {
  Transmission:        'cyan',
  Engineering:         'green',
  'Spectrum Dispatch': 'purple',
  'Jump Point':        'amber',
  'Lore Builder':      'amber',
  Organizational:      'slate',
  Portfolio:           'green',
  Update:              'cyan',
  News:                'slate',
  'Press Release':     'cyan',
};

function categoryColor(cat: string | null): BadgeColor {
  if (!cat) return 'slate';
  return CATEGORY_COLORS[cat] ?? 'slate';
}

// ── ChipGroup ─────────────────────────────────────────────────────────────────

function ChipGroup({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      <button
        type="button"
        onClick={() => onChange('')}
        className={`px-2 py-1 rounded-sm text-xs font-mono-sc transition-colors ${!value ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-800' : 'text-slate-500 hover:text-slate-300 border border-transparent hover:border-border'}`}
      >
        All
      </button>
      {options.map((opt) => {
        const color = categoryColor(opt);
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(active ? '' : opt)}
            className={`px-2 py-1 rounded-sm text-xs font-mono-sc transition-colors border ${
              active
                ? `bg-${color}-950/60 text-${color}-400 border-${color}-800`
                : 'text-slate-500 hover:text-slate-300 border-transparent hover:border-border'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ── CommLinkCard ──────────────────────────────────────────────────────────────

function CommLinkCard({ entry, isSelected, onClick }: { entry: CommLink; isSelected: boolean; onClick: () => void }) {
  const color = categoryColor(entry.category);
  const BORDER: Record<BadgeColor, string> = {
    cyan: 'border-l-cyan-600', amber: 'border-l-amber-500', green: 'border-l-green-500',
    purple: 'border-l-purple-500', slate: 'border-l-slate-600',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group w-full text-left rounded-sm border border-l-2 transition-all duration-150 overflow-hidden',
        BORDER[color],
        isSelected
          ? 'bg-cyan-950/20 border-t-cyan-900/60 border-r-cyan-900/60 border-b-cyan-900/60 shadow-[inset_0_0_20px_rgba(6,182,212,0.04)]'
          : 'bg-panel/60 border-t-border border-r-border border-b-border hover:border-t-slate-700 hover:border-r-slate-700 hover:border-b-slate-700 hover:bg-white/[0.02]',
      ].join(' ')}
    >
      <div className="flex gap-3 p-3">
        {/* Thumbnail */}
        {entry.thumbnail_url && (
          <div className="relative w-20 h-14 rounded-sm overflow-hidden shrink-0 bg-slate-900">
            <Image src={entry.thumbnail_url} alt={entry.title} fill className="object-cover" unoptimized />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {entry.category && (
            <span className={`inline-block text-[9px] font-mono-sc uppercase tracking-widest text-${color}-500 mb-0.5`}>
              {entry.category}
            </span>
          )}
          <p className={`font-rajdhani font-semibold text-sm leading-tight line-clamp-2 ${isSelected ? 'text-cyan-100' : 'text-slate-200 group-hover:text-slate-100'}`}>
            {entry.title}
          </p>
          {entry.excerpt && (
            <p className="text-[10px] text-slate-500 leading-snug line-clamp-2 mt-0.5">{entry.excerpt}</p>
          )}
          {entry.published_at && (
            <p className="text-[9px] font-mono-sc text-slate-700 mt-1 flex items-center gap-1">
              <Calendar size={8} />
              {formatDate(entry.published_at)}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ── DetailPanel ───────────────────────────────────────────────────────────────

function DetailPanel({ entry }: { entry: CommLink }) {
  const color = categoryColor(entry.category);
  return (
    <ScifiPanel title="Comm-Link" subtitle={entry.category ?? undefined}>
      {/* Thumbnail */}
      {entry.thumbnail_url && (
        <div className="relative w-full h-44 rounded-sm overflow-hidden bg-slate-900 mb-4">
          <Image src={entry.thumbnail_url} alt={entry.title} fill className="object-cover" unoptimized />
          <div className="absolute inset-0 bg-linear-to-t from-slate-950/70 via-transparent to-transparent" />
        </div>
      )}

      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {entry.category && <GlowBadge color={color}><Tag size={10} />{entry.category}</GlowBadge>}
          {entry.published_at && (
            <span className="text-[10px] font-mono-sc text-slate-600 flex items-center gap-1">
              <Calendar size={9} />{formatDate(entry.published_at)}
            </span>
          )}
        </div>
        <h3 className="font-orbitron text-sm text-slate-100 leading-snug">{entry.title}</h3>
      </div>

      {/* Content */}
      <div className="space-y-2">
        {entry.content ? (
          <div className="sci-panel p-3">
            <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-2">
              <BookOpen size={9} /> Content
            </p>
            <div
              className="text-xs text-slate-400 leading-relaxed space-y-2 max-h-[50vh] overflow-y-auto pr-1 comm-link-content"
              dangerouslySetInnerHTML={{ __html: entry.content }}
            />
          </div>
        ) : entry.excerpt ? (
          <div className="sci-panel p-3">
            <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-1">
              <BookOpen size={9} /> Excerpt
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">{entry.excerpt}</p>
          </div>
        ) : null}

        {/* RSI link */}
        {entry.rsi_url && (
          <a
            href={entry.rsi_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 sci-panel p-2.5 bg-cyan-950/10 border-cyan-900/30 hover:border-cyan-500/40 transition-colors text-xs text-cyan-400 font-mono-sc"
          >
            <ExternalLink size={12} /> Read on RSI
          </a>
        )}
      </div>
    </ScifiPanel>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CommLinksPage() {
  const searchParams = useSearchParams();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams?.get('search') ?? '');
  const [category, setCategory] = useState(searchParams?.get('category') ?? '');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const debouncedSearch = useDebounce(search, 350);

  const { data: categories } = useQuery({
    queryKey: ['commlinks.categories'],
    queryFn: () => api.commLinks.categories(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['commlinks.list', { page, search: debouncedSearch, category }],
    queryFn: () => api.commLinks.list({ search: debouncedSearch || undefined, category: category || undefined, page, limit: LIMIT }),
  });

  const { data: selectedFallback } = useQuery({
    queryKey: ['commlinks.single', selectedId],
    queryFn: () => api.commLinks.get(String(selectedId!)),
    enabled: !!selectedId && !data?.data?.find((e) => e.id === selectedId),
  });

  const sel: CommLink | null = data?.data?.find((e) => e.id === selectedId) ?? selectedFallback ?? null;

  useEffect(() => {
    if (data?.data?.length && !selectedId) setSelectedId(data.data[0].id);
  }, [data?.data, selectedId]);

  const summary = useMemo(() => (data ? { total: data.total, showing: data.data.length } : null), [data]);
  const hasFilters = !!(debouncedSearch || category);

  return (
    <div className="max-w-(--breakpoint-2xl) mx-auto">
      <PageHeader
        title="Comm-Links"
        count={summary?.total}
        countLabel="dispatches"
        search={search}
        searchPlaceholder="Search title or content…"
        onSearch={(v) => { setSearch(v); setPage(1); }}
      />

      {/* Filter bar */}
      {categories && categories.length > 0 && (
        <div className="mb-4">
          <div className="sci-panel p-3 flex flex-wrap items-center gap-3">
            <p className="text-[10px] font-orbitron text-slate-600 tracking-widest uppercase shrink-0">Category</p>
            <ChipGroup options={categories} value={category} onChange={(v) => { setCategory(v); setPage(1); }} />
            {hasFilters && (
              <button
                type="button"
                onClick={() => { setSearch(''); setCategory(''); setPage(1); }}
                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors ml-auto"
              >
                <X size={12} /> Reset
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-4 items-start">
        {/* List */}
        <div>
          {isLoading ? (
            <LoadingGrid message="LOADING COMM-LINKS…" />
          ) : error ? (
            <ErrorState error={error as Error} onRetry={() => void refetch()} />
          ) : !data?.data?.length ? (
            <EmptyState icon={<Newspaper size={32} />} title="No comm-links found" />
          ) : (
            <>
              <div className="space-y-1.5">
                {data.data.map((entry, i) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.015, 0.3) }}
                  >
                    <CommLinkCard
                      entry={entry}
                      isSelected={selectedId === entry.id}
                      onClick={() => setSelectedId(entry.id)}
                    />
                  </motion.div>
                ))}
              </div>
              {(data.pages ?? 0) > 1 && (
                <div className="mt-4">
                  <Pagination page={page} totalPages={data.pages!} onPageChange={setPage} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Detail */}
        <div className="xl:sticky xl:top-6">
          {sel ? (
            <DetailPanel entry={sel} />
          ) : (
            <ScifiPanel title="Comm-Link" subtitle="Select a dispatch">
              <p className="text-xs text-slate-500">Click an entry to read it.</p>
            </ScifiPanel>
          )}
        </div>
      </div>
    </div>
  );
}
