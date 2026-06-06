'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Calendar, Newspaper, Radio, Rows3 } from 'lucide-react';
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
import type { CommLink } from '@/types/api';

const LIMIT = 30;

type BadgeColor = 'cyan' | 'amber' | 'green' | 'purple' | 'slate';

const CATEGORY_COLORS: Record<string, BadgeColor> = {
  Transmission: 'cyan',
  Engineering: 'green',
  'Spectrum Dispatch': 'purple',
  'Jump Point': 'amber',
  'Lore Builder': 'amber',
  Organizational: 'slate',
  Portfolio: 'green',
  Update: 'cyan',
  News: 'slate',
  'Press Release': 'cyan',
};

const BORDER_COLORS: Record<BadgeColor, string> = {
  cyan: 'border-cyan-700/50',
  amber: 'border-amber-700/50',
  green: 'border-green-700/50',
  purple: 'border-purple-700/50',
  slate: 'border-slate-700',
};

const TEXT_COLORS: Record<BadgeColor, string> = {
  cyan: 'text-cyan-400',
  amber: 'text-amber-400',
  green: 'text-green-400',
  purple: 'text-purple-400',
  slate: 'text-slate-400',
};

const SOFT_BG_COLORS: Record<BadgeColor, string> = {
  cyan: 'bg-cyan-950/15',
  amber: 'bg-amber-950/15',
  green: 'bg-green-950/15',
  purple: 'bg-purple-950/15',
  slate: 'bg-slate-950/30',
};

function categoryColor(cat: string | null): BadgeColor {
  if (!cat) return 'slate';
  return CATEGORY_COLORS[cat] ?? 'slate';
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function CategoryLabel({ category }: { category: string | null }) {
  const color = categoryColor(category);
  if (!category) return null;

  return (
    <span className={`inline-flex rounded-sm border px-1.5 py-0.5 font-mono-sc text-[9px] uppercase leading-none tracking-widest ${BORDER_COLORS[color]} ${SOFT_BG_COLORS[color]} ${TEXT_COLORS[color]}`}>
      {category}
    </span>
  );
}

function FeaturedArticle({ entry }: { entry: CommLink }) {
  return (
    <Link
      href={`/comm-links/${entry.id}`}
      className="group grid overflow-hidden rounded-sm border border-cyan-900/40 bg-panel/70 transition-colors hover:border-cyan-500/50 lg:grid-cols-[1.1fr_0.9fr]"
    >
      <div className="relative min-h-72 bg-slate-950">
        {entry.thumbnail_url ? (
          <Image src={entry.thumbnail_url} alt={entry.title} fill className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" unoptimized />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Newspaper size={44} className="text-cyan-900" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
      </div>
      <div className="flex flex-col justify-between p-5">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 font-mono-sc text-[10px] uppercase tracking-widest text-cyan-300">
              <Radio size={12} />
              Front page
            </span>
            <CategoryLabel category={entry.category} />
          </div>
          <h2 className="font-orbitron text-2xl leading-tight text-slate-100 transition-colors group-hover:text-white">
            {entry.title}
          </h2>
          {entry.excerpt && (
            <p className="mt-4 text-sm leading-relaxed text-slate-400 line-clamp-5">{entry.excerpt}</p>
          )}
        </div>
        {entry.published_at && (
          <p className="mt-6 flex items-center gap-1 border-t border-slate-800 pt-3 font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">
            <Calendar size={10} />
            {formatDate(entry.published_at)}
          </p>
        )}
      </div>
    </Link>
  );
}

function CommLinkCard({ entry }: { entry: CommLink }) {
  return (
    <Link
      href={`/comm-links/${entry.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-sm border border-slate-800 bg-panel/55 transition-colors hover:border-cyan-700/60 hover:bg-white/[0.025]"
    >
      <div className="relative aspect-[16/9] bg-slate-950">
        {entry.thumbnail_url ? (
          <Image src={entry.thumbnail_url} alt={entry.title} fill className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" unoptimized />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Newspaper size={30} className="text-slate-800" />
          </div>
        )}
        <div className="absolute left-3 top-3">
          <CategoryLabel category={entry.category} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="font-rajdhani text-lg font-semibold leading-tight text-slate-200 transition-colors group-hover:text-white line-clamp-2">
          {entry.title}
        </p>
        {entry.excerpt && (
          <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-500 line-clamp-3">{entry.excerpt}</p>
        )}
        {entry.published_at && (
          <p className="mt-4 flex items-center gap-1 font-mono-sc text-[10px] uppercase tracking-widest text-slate-700">
            <Calendar size={10} />
            {formatDate(entry.published_at)}
          </p>
        )}
      </div>
    </Link>
  );
}

export default function CommLinksPage() {
  const searchParams = useSearchParams();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams?.get('search') ?? '');
  const [category, setCategory] = useState(searchParams?.get('category') ?? '');
  const debouncedSearch = useDebounce(search, 350);

  const { data: categories } = useQuery({
    queryKey: ['commlinks.categories'],
    queryFn: () => api.commLinks.categories(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['commlinks.list', { page, search: debouncedSearch, category }],
    queryFn: () =>
      api.commLinks.list({ search: debouncedSearch || undefined, category: category || undefined, page, limit: LIMIT }),
  });

  const entries = data?.data ?? [];
  const featured = entries[0];
  const articles = entries.slice(1);

  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      if (entry.category) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
  }, [entries]);

  const hasFilters = !!(debouncedSearch || category);

  return (
    <PageShell>
      <PageHeader
        title="Comm-Links"
        count={data?.total}
        countLabel="articles"
        search={search}
        searchPlaceholder="Search title or content..."
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
      />

      {categories && categories.length > 0 && (
        <ListFilterBar>
          <ListFilterChips
            items={categories.map((item) => ({ key: item, label: item }))}
            selected={category}
            onSelect={(value) => {
              setCategory(value);
              setPage(1);
            }}
            className="mb-0"
          />
          {hasFilters && (
            <ListFilterResetButton
              onClick={() => {
                setSearch('');
                setCategory('');
                setPage(1);
              }}
            />
          )}
        </ListFilterBar>
      )}

      {isLoading ? (
        <LoadingGrid message="LOADING COMM-LINKS..." />
      ) : error ? (
        <ErrorState error={error as Error} onRetry={() => void refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState icon={<Newspaper size={32} />} title="No comm-links found" />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              {featured && <FeaturedArticle entry={featured} />}

              <div>
                <div className="mb-3 flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Rows3 size={14} className="text-cyan-400" />
                  <h2 className="font-orbitron text-sm uppercase tracking-widest text-slate-300">Latest articles</h2>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {articles.map((entry, i) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.015, 0.3) }}
                    >
                      <CommLinkCard entry={entry} />
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <ScifiPanel title="Magazine">
                <div className="space-y-3">
                  <div className="rounded-sm border border-slate-800 bg-slate-950/30 p-3">
                    <p className="font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">Articles in view</p>
                    <p className="mt-1 font-orbitron text-2xl text-cyan-300">{entries.length}</p>
                  </div>
                  {sectionCounts.map(([name, count]) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setCategory(name);
                        setPage(1);
                      }}
                      className="flex w-full items-center justify-between rounded-sm border border-slate-800 bg-slate-950/20 px-3 py-2 text-left transition-colors hover:border-cyan-700/60"
                    >
                      <span className="truncate font-rajdhani text-sm font-semibold text-slate-300">{name}</span>
                      <span className="font-mono-sc text-[10px] text-cyan-400">{count}</span>
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
