'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BookOpen, Globe, Layers } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListFilterBar, ListFilterChips, ListFilterResetButton } from '@/components/ui/ListFilters';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { Pagination } from '@/components/ui/Pagination';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { useDebounce } from '@/hooks/useDebounce';
import { api } from '@/services/api';
import type { GalactapediaEntry } from '@/types/api';

const LIMIT = 30;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function parseArray(v: GalactapediaEntry['categories']): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try {
    return JSON.parse(v as string);
  } catch {
    return [];
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function primaryCategory(entry: GalactapediaEntry): string {
  return parseArray(entry.categories)[0] ?? 'Archive';
}

function CategoryPill({ children }: { children: string }) {
  return (
    <span className="rounded-sm border border-purple-900/50 bg-purple-950/20 px-1.5 py-0.5 font-mono-sc text-[9px] uppercase leading-none tracking-widest text-purple-300">
      {children}
    </span>
  );
}

function FeaturedEntry({ entry }: { entry: GalactapediaEntry }) {
  const cats = parseArray(entry.categories);

  return (
    <Link
      href={`/galactapedia/${entry.id}`}
      className="group grid min-h-56 overflow-hidden rounded-sm border border-purple-900/40 bg-panel/70 transition-colors hover:border-purple-500/50 lg:grid-cols-[340px_1fr]"
    >
      <div className="relative min-h-52 bg-slate-950">
        {entry.thumbnail_url ? (
          <Image src={entry.thumbnail_url} alt={entry.title} fill className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" unoptimized />
        ) : (
          <div className="flex h-full items-center justify-center">
            <BookOpen size={40} className="text-purple-900" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
      </div>
      <div className="flex flex-col justify-between p-5">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 font-mono-sc text-[10px] uppercase tracking-widest text-purple-300">
              <BookOpen size={12} />
              Featured dossier
            </span>
            {cats.slice(0, 3).map((cat) => (
              <CategoryPill key={cat}>{cat}</CategoryPill>
            ))}
          </div>
          <h2 className="font-orbitron text-xl leading-tight text-slate-100 transition-colors group-hover:text-white">
            {entry.title}
          </h2>
          {entry.excerpt && (
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400 line-clamp-4">{entry.excerpt}</p>
          )}
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-3 font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">
          <span>{primaryCategory(entry)}</span>
          {entry.updated_at && <span>Updated {formatDate(entry.updated_at)}</span>}
        </div>
      </div>
    </Link>
  );
}

function GalactapediaCard({ entry }: { entry: GalactapediaEntry }) {
  const cats = parseArray(entry.categories);

  return (
    <Link
      href={`/galactapedia/${entry.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-sm border border-slate-800 bg-panel/55 transition-colors hover:border-purple-600/50 hover:bg-white/[0.025]"
    >
      <div className="relative h-36 shrink-0 overflow-hidden bg-slate-950">
        {entry.thumbnail_url ? (
          <Image
            src={entry.thumbnail_url}
            alt={entry.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-950 to-purple-950/10">
            <BookOpen size={28} className="text-purple-900/60" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
        {cats[0] && (
          <span className="absolute bottom-2 left-2 rounded-sm border border-purple-900/60 bg-slate-950/80 px-1.5 py-0.5 font-mono-sc text-[9px] uppercase tracking-widest text-purple-300 backdrop-blur-sm">
            {cats[0]}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <p className="font-rajdhani text-sm font-semibold leading-tight text-slate-200 line-clamp-2 transition-colors group-hover:text-white">
          {entry.title}
        </p>
        {entry.excerpt && (
          <p className="mt-1.5 flex-1 text-[11px] leading-relaxed text-slate-500 line-clamp-2">{entry.excerpt}</p>
        )}
      </div>
    </Link>
  );
}

export default function GalactapediaPage() {
  const searchParams = useSearchParams();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams?.get('search') ?? '');
  const [category, setCategory] = useState(searchParams?.get('category') ?? '');
  const [letter, setLetter] = useState('');
  const debouncedSearch = useDebounce(search, 350);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['galactapedia.list', { page, search: debouncedSearch, category, letter }],
    queryFn: () =>
      api.galactapedia.list({ search: debouncedSearch || undefined, category: category || undefined, letter: letter || undefined, page, limit: LIMIT }),
  });

  const entries = data?.data ?? [];
  const featured = entries[0];
  const library = entries.slice(1);

  const allCategories = useMemo(() => {
    const seen = new Set<string>();
    for (const entry of entries) {
      for (const c of parseArray(entry.categories)) seen.add(c);
    }
    return [...seen].sort();
  }, [entries]);

  const categoryIndex = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      for (const c of parseArray(entry.categories)) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
  }, [entries]);

  const hasFilters = !!(debouncedSearch || category || letter);

  function resetAll() {
    setSearch('');
    setCategory('');
    setLetter('');
    setPage(1);
  }

  return (
    <PageShell>
      <PageHeader
        title="Galactapedia"
        count={data?.total}
        countLabel="articles"
        search={search}
        searchPlaceholder="Search lore entries..."
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
      />

      {/* Alphabetical navigation */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-800/60 pb-3">
        <button
          type="button"
          onClick={() => { setLetter(''); setPage(1); }}
          className={`rounded-sm px-2 py-1 font-mono-sc text-[10px] uppercase tracking-widest transition-colors ${!letter ? 'bg-purple-950/40 text-purple-300 border border-purple-700/50' : 'text-slate-600 hover:text-slate-300'}`}
        >
          All
        </button>
        {ALPHABET.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => { setLetter(l === letter ? '' : l); setPage(1); }}
            className={`rounded-sm px-1.5 py-1 font-mono-sc text-[10px] uppercase tracking-widest transition-colors ${l === letter ? 'bg-purple-950/40 text-purple-300 border border-purple-700/50' : 'text-slate-600 hover:text-purple-400'}`}
          >
            {l}
          </button>
        ))}
      </div>

      <ListFilterBar>
        {allCategories.length > 0 && (
          <ListFilterChips
            items={allCategories.map((item) => ({ key: item, label: item }))}
            selected={category}
            onSelect={(value) => {
              setCategory(value);
              setPage(1);
            }}
            className="mb-0"
          />
        )}
        {hasFilters && (
          <ListFilterResetButton onClick={resetAll} />
        )}
      </ListFilterBar>

      {isLoading ? (
        <LoadingGrid message="LOADING GALACTAPEDIA..." />
      ) : error ? (
        <ErrorState error={error as Error} onRetry={() => void refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState icon={<Globe size={32} />} title="No entries found" />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              {featured && !letter && !category && !debouncedSearch && (
                <FeaturedEntry entry={featured} />
              )}

              <div>
                <div className="mb-3 flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Layers size={14} className="text-purple-400" />
                  <h2 className="font-orbitron text-sm uppercase tracking-widest text-slate-300">
                    {letter ? `Entries — ${letter}` : category ? category : 'Lore index'}
                  </h2>
                  {data?.total != null && (
                    <span className="ml-auto font-mono-sc text-[10px] text-slate-600">{data.total} entries</span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(letter || category || debouncedSearch ? entries : library).map((entry, i) => (
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
              </div>
            </div>

            <div className="space-y-3">
              <ScifiPanel title="Archive">
                <div className="space-y-3">
                  <div className="rounded-sm border border-slate-800 bg-slate-950/30 p-3">
                    <p className="font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">Total entries</p>
                    <p className="mt-1 font-orbitron text-2xl text-purple-300">{data?.total ?? entries.length}</p>
                  </div>
                  {categoryIndex.map(([name, count]) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setCategory(name === category ? '' : name);
                        setPage(1);
                      }}
                      className={`flex w-full items-center justify-between rounded-sm border px-3 py-2 text-left transition-colors ${name === category ? 'border-purple-700/60 bg-purple-950/20' : 'border-slate-800 bg-slate-950/20 hover:border-purple-700/60'}`}
                    >
                      <span className="truncate font-rajdhani text-sm font-semibold text-slate-300">{name}</span>
                      <span className="font-mono-sc text-[10px] text-purple-400">{count}</span>
                    </button>
                  ))}
                </div>
              </ScifiPanel>
            </div>
          </div>

          {(data?.pages ?? 0) > 1 && (
            <div className="mt-4">
              <Pagination page={page} totalPages={data?.pages ?? 1} onPageChange={setPage} />
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
