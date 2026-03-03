import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/services/api';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { FilterPanel } from '@/components/ui/FilterPanel';
import { fDateTime } from '@/utils/formatters';
import { motion } from 'framer-motion';

const LIMIT = 40;

const ENTITY_TYPES = ['ship', 'component', 'item', 'commodity', 'paint', 'shop'];
const CHANGE_TYPES = ['added', 'removed', 'modified'];

export default function ChangelogPage() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [changeType, setChangeType] = useState('');

  const { data: summary } = useQuery({
    queryKey: ['changelog.summary'],
    queryFn: api.changelog.summary,
  });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['changelog.list', { page, entityType, changeType }],
    queryFn: () => api.changelog.list({
      limit: LIMIT, offset: (page - 1) * LIMIT,
      entity_type: entityType || undefined,
      change_type: changeType || undefined,
    }),
  });

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;
  const hasFilters = !!(entityType || changeType);
  const resetFilters = () => { setEntityType(''); setChangeType(''); setPage(1); };

  return (
    <div className="max-w-screen-xl mx-auto space-y-6">
      <div>
        <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">Changelog</h1>
        {summary && (
          <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">
            {summary.total.toLocaleString('fr-FR')} entrées
            {summary.last_extraction && ` · Dernière extraction : ${fDateTime(summary.last_extraction)}`}
          </p>
        )}
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(summary.by_change).map(([type, count]) => (
            <div key={type} className="sci-panel px-3 py-1.5 flex items-center gap-2">
              <GlowBadge color={type === 'added' ? 'green' : type === 'removed' ? 'red' : 'amber'}>{type}</GlowBadge>
              <span className="font-mono-sc text-sm text-slate-300">{(count as number).toLocaleString('fr-FR')}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-4">
        <div className="w-44 flex-shrink-0">
          <FilterPanel
            hasFilters={hasFilters}
            onReset={resetFilters}
            groups={[
              {
                key: 'entity_type', label: 'Entité',
                options: ENTITY_TYPES.map(t => ({ label: t, value: t })),
                value: entityType,
                onChange: v => { setEntityType(v); setPage(1); },
              },
              {
                key: 'change_type', label: 'Changement',
                options: CHANGE_TYPES.map(t => ({ label: t, value: t })),
                value: changeType,
                onChange: v => { setChangeType(v); setPage(1); },
              },
            ]}
          />
        </div>

        <div className="flex-1 min-w-0">
          {isLoading ? <LoadingGrid message="CHARGEMENT…" />
          : error ? <ErrorState error={error as Error} onRetry={() => void refetch()} />
          : (
            <>
              <div className="space-y-1.5">
                {data?.data.map((entry, i) => (
                  <motion.div key={entry.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.4) }}>
                    <div className="sci-panel px-4 py-2.5 flex items-center gap-3">
                      <GlowBadge
                        color={entry.change_type === 'added' ? 'green' : entry.change_type === 'removed' ? 'red' : 'amber'}
                        size="xs"
                      >
                        {entry.change_type}
                      </GlowBadge>
                      <GlowBadge color="slate" size="xs">{entry.entity_type}</GlowBadge>
                      <span className="flex-1 text-sm text-slate-300 truncate">{entry.entity_name}</span>
                      {entry.game_version && (
                        <span className="text-xs font-mono-sc text-slate-600 hidden md:block">{entry.game_version}</span>
                      )}
                      <span className="text-xs font-mono-sc text-slate-700 flex-shrink-0 hidden lg:block">
                        {fDateTime(entry.changed_at)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
              <Pagination className="mt-6" page={page} totalPages={totalPages} onPageChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
