'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Globe, Tag, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { GalactapediaEntry } from '@/types/api';
import { api } from '@/services/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { useDebounce } from '@/hooks/useDebounce';

const LIMIT = 30;

function parseArray(v: GalactapediaEntry['categories']): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v as string); } catch { return []; }
}

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

function GalactapediaCard({ entry }: { entry: GalactapediaEntry }) {
  const cats = parseArray(entry.categories);
  return (
    <Link
      href={`/galactapedia/${entry.id}`}
      className="group flex gap-3 p-3 rounded-sm border border-l-2 border-l-purple-600 border-t-border border-r-border border-b-border bg-panel/60 hover:border-t-slate-700 hover:border-r-slate-700 hover:border-b-slate-700 hover:bg-white/[0.02] transition-all duration-150 overflow-hidden"
    >
      {entry.thumbnail_url && (
        <div className="relative w-16 h-16 rounded-sm overflow-hidden shrink-0 bg-slate-900">
          <Image src={entry.thumbnail_url} alt={entry.title} fill className="object-cover" unoptimized />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-rajdhani font-semibold text-sm leading-tight text-slate-200 group-hover:text-slate-100">
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
      <Tag size={12} className="shrink-0 self-center text-slate-700 group-hover:text-purple-600 transition-colors" />
    </Link>
  );
}

export default function GalactapediaPage() {
  const searchParams = useSearchParams();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams?.get('search') ?? '');
  const [category, setCategory] = useState(searchParams?.get('category') ?? '');
  const debouncedSearch = useDebounce(search, 350);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['galactapedia.list', { page, search: debouncedSearch, category }],
    queryFn: () => api.galactapedia.list({ search: debouncedSearch || undefined, category: category || undefined, page, limit: LIMIT }),
  });

  const allCategories = useMemo(() => {
    if (!data?.data) return [];
    const seen = new Set<string>();
    for (const entry of data.data) {
      for (const c of parseArray(entry.categories)) seen.add(c);
    }
    return [...seen].sort();
  }, [data?.data]);

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

      {/* List */}
      {isLoading ? (
        <LoadingGrid message="LOADING GALACTAPEDIA…" />
      ) : error ? (
        <ErrorState error={error as Error} onRetry={() => void refetch()} />
      ) : !data?.data?.length ? (
        <EmptyState icon={<Globe size={32} />} title="No entries found" />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
            {data.data.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.015, 0.3) }}
              >
                <GalactapediaCard entry={entry} />
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
  );
}
