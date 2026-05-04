import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Palette } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { useListQueryState } from '@/hooks/useListQueryState';
import type { PaintListItem } from '@/types/api';

const LIMIT = 40;

export default function PaintsPage() {
  const { env } = useEnv();
  const { page, search, debouncedSearch, updateSearch, updatePageWithScroll } = useListQueryState();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['paints.list', env, { page, search: debouncedSearch }],
    queryFn: () => api.paints.list({ env, page, limit: LIMIT, search: debouncedSearch || undefined }),
  });

  return (
    <div className="max-w-(--breakpoint-2xl) mx-auto">
      <PageHeader
        title="Paints"
        count={data?.total}
        countLabel="paints"
        search={search}
        searchPlaceholder="Search paint or ship…"
        onSearch={updateSearch}
      />

      {isLoading ? (
        <LoadingGrid message="LOADING PAINTS…" />
      ) : error ? (
        <ErrorState error={error as Error} onRetry={() => void refetch()} />
      ) : !data?.data?.length ? (
        <EmptyState icon="🎨" title="No paints found" />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {(data.data as PaintListItem[]).map((p, i) => (
              <motion.div
                key={p.paint_uuid}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.4) }}
              >
                <div className="sci-panel px-4 py-3 hover:border-cyan-800 transition-colors h-full">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-sm shrink-0 border border-cyan-800/50 bg-linear-to-br from-cyan-900/60 to-blue-900/60 flex items-center justify-center">
                      <Palette size={12} className="text-cyan-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-rajdhani font-semibold text-slate-200 truncate">
                        {p.paint_name}
                      </p>
                      {p.ship_name && (
                        <Link
                          href={`/ships/${p.ship_uuid}`}
                          className="text-xs text-cyan-700 hover:text-cyan-400 transition-colors truncate block mt-0.5"
                        >
                          {p.manufacturer_name && (
                            <span className="text-slate-600 mr-1">{p.manufacturer_name}</span>
                          )}
                          {p.ship_name}
                        </Link>
                      )}
                      <p className="text-xs font-mono-sc text-slate-700 truncate mt-0.5">
                        {p.paint_class_name}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          {data && (
            <Pagination
              className="mt-6"
              page={data.page}
              totalPages={data.pages}
              onPageChange={updatePageWithScroll}
            />
          )}
        </>
      )}
    </div>
  );
}
