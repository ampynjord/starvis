'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BookOpen,
  ExternalLink,
  Globe,
  Tag,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { GalactapediaEntry } from '@/types/api';
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

function parseArray(v: string[] | string | null): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return []; }
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
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(value === opt ? '' : opt)}
          className={`px-2 py-1 rounded-sm text-xs font-mono-sc transition-colors border ${value === opt ? 'bg-purple-950/60 text-purple-400 border-purple-800' : 'text-slate-500 hover:text-slate-300 border-transparent hover:border-border'}`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ── GalactapediaCard ──────────────────────────────────────────────────────────

function GalactapediaCard({ entry, isSelected, onClick }: { entry: GalactapediaEntry; isSelected: boolean; onClick: () => void }) {
  const cats = parseArray(entry.categories);
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group w-full text-left rounded-sm border border-l-2 border-l-purple-600 transition-all duration-150 overflow-hidden',
        isSelected
          ? 'bg-purple-950/15 border-t-purple-900/60 border-r-purple-900/60 border-b-purple-900/60 shadow-[inset_0_0_20px_rgba(168,85,247,0.04)]'
          : 'bg-panel/60 border-t-border border-r-border border-b-border hover:border-t-slate-700 hover:border-r-slate-700 hover:border-b-slate-700 hover:bg-white/[0.02]',
      ].join(' ')}
    >
      <div className="flex gap-3 p-3">
        {/* Thumbnail */}
        {entry.thumbnail_url && (
          <div className="relative w-16 h-16 rounded-sm overflow-hidden shrink-0 bg-slate-900">
            <Image src={entry.thumbnail_url} alt={entry.title} fill className="object-cover" unoptimized />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={`font-rajdhani font-semibold text-sm leading-tight ${isSelected ? 'text-purple-100' : 'text-slate-200 group-hover:text-slate-100'}`}>
            {entry.title}
          </p>
          {cats.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {cats.slice(0, 3).map((c) => (
                <span key={c} className="text-[9px] font-mono-sc text-purple-500 border border-purple-900/40 bg-purple-950/20 rounded-sm px-1 py-0.5 leading-none">
                  {c}
                </span>
              ))}
            </div>
          )}
          {entry.excerpt && (
            <p className="text-[10px] text-slate-500 leading-snug line-clamp-2 mt-1">{entry.excerpt}</p>
          )}
        </div>
      </div>
    </button>
  );
}

// ── DetailPanel ───────────────────────────────────────────────────────────────

function DetailPanel({ entry }: { entry: GalactapediaEntry }) {
  const cats = parseArray(entry.categories);
  const tags = parseArray(entry.tags);

  return (
    <ScifiPanel title="Galactapedia" subtitle={cats[0] ?? undefined}>
      {/* Thumbnail */}
      {entry.thumbnail_url && (
        <div className="relative w-full h-44 rounded-sm overflow-hidden bg-slate-900 mb-4">
          <Image src={entry.thumbnail_url} alt={entry.title} fill className="object-cover" unoptimized />
          <div className="absolute inset-0 bg-linear-to-t from-slate-950/80 via-transparent to-transparent" />
        </div>
      )}

      {/* Header */}
      <div className="mb-4">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {cats.map((c) => (
            <GlowBadge key={c} color="purple"><Tag size={9} />{c}</GlowBadge>
          ))}
        </div>
        <h3 className="font-orbitron text-sm text-slate-100 leading-snug">{entry.title}</h3>
      </div>

      <div className="space-y-2">
        {/* Tags */}
        {tags.length > 0 && (
          <div className="sci-panel p-2.5">
            <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-1.5">
              <Tag size={9} /> Tags
            </p>
            <div className="flex flex-wrap gap-1">
              {tags.map((t) => (
                <span key={t} className="text-[9px] font-mono-sc text-slate-500 border border-slate-800 bg-slate-900/40 rounded-sm px-1.5 py-0.5 leading-none">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        {entry.content ? (
          <div className="sci-panel p-3">
            <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-2">
              <BookOpen size={9} /> Encyclopedia
            </p>
            <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap max-h-[50vh] overflow-y-auto pr-1">
              {entry.content}
            </p>
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
            className="flex items-center gap-2 sci-panel p-2.5 bg-purple-950/10 border-purple-900/30 hover:border-purple-500/40 transition-colors text-xs text-purple-400 font-mono-sc"
          >
            <ExternalLink size={12} /> Read on RSI Galactapedia
          </a>
        )}
      </div>
    </ScifiPanel>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GalactapediaPage() {
  const searchParams = useSearchParams();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams?.get('search') ?? '');
  const [category, setCategory] = useState(searchParams?.get('category') ?? '');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 350);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['galactapedia.list', { page, search: debouncedSearch, category }],
    queryFn: () => api.galactapedia.list({ search: debouncedSearch || undefined, category: category || undefined, page, limit: LIMIT }),
  });

  // derive categories from first page
  const allCategories = useMemo(() => {
    if (!data?.data) return [];
    const seen = new Set<string>();
    for (const entry of data.data) {
      for (const c of parseArray(entry.categories)) seen.add(c);
    }
    return [...seen].sort();
  }, [data?.data]);

  const { data: selectedFallback } = useQuery({
    queryKey: ['galactapedia.single', selectedId],
    queryFn: () => api.galactapedia.get(selectedId!),
    enabled: !!selectedId && !data?.data?.find((e) => e.id === selectedId),
  });

  const sel: GalactapediaEntry | null = data?.data?.find((e) => e.id === selectedId) ?? selectedFallback ?? null;

  useEffect(() => {
    if (data?.data?.length && !selectedId) setSelectedId(data.data[0].id);
  }, [data?.data, selectedId]);

  const summary = useMemo(() => (data ? { total: data.total } : null), [data]);
  const hasFilters = !!(debouncedSearch || category);

  return (
    <div className="max-w-(--breakpoint-2xl) mx-auto">
      <PageHeader
        title="Galactapedia"
        count={summary?.total}
        countLabel="articles"
        search={search}
        searchPlaceholder="Search lore entries…"
        onSearch={(v) => { setSearch(v); setPage(1); }}
      />

      {/* Filter bar */}
      <div className="mb-4">
        <div className="sci-panel p-3 flex flex-wrap items-center gap-3">
          {allCategories.length > 0 && (
            <>
              <p className="text-[10px] font-orbitron text-slate-600 tracking-widest uppercase shrink-0">Category</p>
              <ChipGroup options={allCategories} value={category} onChange={(v) => { setCategory(v); setPage(1); }} />
            </>
          )}
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

      {/* Content */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-4 items-start">
        {/* List */}
        <div>
          {isLoading ? (
            <LoadingGrid message="LOADING GALACTAPEDIA…" />
          ) : error ? (
            <ErrorState error={error as Error} onRetry={() => void refetch()} />
          ) : !data?.data?.length ? (
            <EmptyState icon={<Globe size={32} />} title="No entries found" />
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
                    <GalactapediaCard
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
            <ScifiPanel title="Galactapedia" subtitle="Select an entry">
              <p className="text-xs text-slate-500">Click an entry to read it.</p>
            </ScifiPanel>
          )}
        </div>
      </div>
    </div>
  );
}
