'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Calendar, Newspaper } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { CommLink } from '@/types/api';
import { api } from '@/services/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { Pagination } from '@/components/ui/Pagination';
import { ListFilterBar, ListFilterChips, ListFilterResetButton } from '@/components/ui/ListFilters';
import { useDebounce } from '@/hooks/useDebounce';

const LIMIT = 30;

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

const BORDER_COLORS: Record<BadgeColor, string> = {
  cyan:   'border-l-cyan-600',
  amber:  'border-l-amber-500',
  green:  'border-l-green-500',
  purple: 'border-l-purple-500',
  slate:  'border-l-slate-600',
};

const TEXT_COLORS: Record<BadgeColor, string> = {
  cyan:   'text-cyan-500',
  amber:  'text-amber-500',
  green:  'text-green-500',
  purple: 'text-purple-500',
  slate:  'text-slate-500',
};

function categoryColor(cat: string | null): BadgeColor {
  if (!cat) return 'slate';
  return CATEGORY_COLORS[cat] ?? 'slate';
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function CommLinkCard({ entry }: { entry: CommLink }) {
  const color = categoryColor(entry.category);
  return (
    <Link
      href={`/comm-links/${entry.id}`}
      className={`group flex gap-3 p-3 rounded-sm border border-l-2 ${BORDER_COLORS[color]} border-t-border border-r-border border-b-border bg-panel/60 hover:border-t-slate-700 hover:border-r-slate-700 hover:border-b-slate-700 hover:bg-white/[0.02] transition-all duration-150 overflow-hidden`}
    >
      {entry.thumbnail_url && (
        <div className="relative w-20 h-14 rounded-sm overflow-hidden shrink-0 bg-slate-900">
          <Image src={entry.thumbnail_url} alt={entry.title} fill className="object-cover" unoptimized />
        </div>
      )}
      <div className="flex-1 min-w-0">
        {entry.category && (
          <span className={`inline-block text-[9px] font-mono-sc uppercase tracking-widest ${TEXT_COLORS[color]} mb-0.5`}>
            {entry.category}
          </span>
        )}
        <p className="font-rajdhani font-semibold text-sm leading-tight line-clamp-2 text-slate-200 group-hover:text-slate-100">
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
    queryFn: () => api.commLinks.list({ search: debouncedSearch || undefined, category: category || undefined, page, limit: LIMIT }),
  });

  const summary = useMemo(() => (data ? { total: data.total } : null), [data]);
  const hasFilters = !!(debouncedSearch || category);

  return (
    <PageShell>
      <PageHeader
        title="Comm-Links"
        count={summary?.total}
        countLabel="dispatches"
        search={search}
        searchPlaceholder="Search title or content…"
        onSearch={(v) => { setSearch(v); setPage(1); }}
      />

      {categories && categories.length > 0 && (
        <ListFilterBar>
          <ListFilterChips
            items={categories.map((item) => ({ key: item, label: item }))}
            selected={category}
            onSelect={(value) => { setCategory(value); setPage(1); }}
            className="mb-0"
          />
          {hasFilters && <ListFilterResetButton onClick={() => { setSearch(''); setCategory(''); setPage(1); }} />}
        </ListFilterBar>
      )}

      {/* List */}
      {isLoading ? (
        <LoadingGrid message="LOADING COMM-LINKS…" />
      ) : error ? (
        <ErrorState error={error as Error} onRetry={() => void refetch()} />
      ) : !data?.data?.length ? (
        <EmptyState icon={<Newspaper size={32} />} title="No comm-links found" />
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
                <CommLinkCard entry={entry} />
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
    </PageShell>
  );
}
