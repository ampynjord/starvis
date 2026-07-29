'use client';

import { useQuery } from '@tanstack/react-query';
import { Boxes, Search } from 'lucide-react';
import { useState } from 'react';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageShell } from '@/components/ui/PageShell';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { useDebounce } from '@/hooks/useDebounce';
import { useEnv } from '@/contexts/EnvContext';
import { api } from '@/services/api';

/**
 * Ce qui peut tomber, et avec quelle chance.
 *
 * Cent soixante et une tables de butin étaient extraites depuis longtemps et
 * servies nulle part. Une caisse ne dit pas grand-chose par son nom : ce qu'on
 * veut voir, c'est la répartition — 32,9 % de nourriture, 24,7 % d'armes.
 *
 * La table sélectionnée s'ouvre à côté de la liste plutôt que sur une page à
 * elle : on compare deux caisses en deux clics, pas en deux navigations.
 */
export default function LootPage() {
  const { env } = useEnv();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const debounced = useDebounce(search, 250);

  const {
    data: list,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['loot.tables', env],
    queryFn: () => api.loot.tables({ env, limit: 200 }),
    staleTime: 60_000,
  });

  const { data: detail } = useQuery({
    queryKey: ['loot.table', selected, env],
    queryFn: () => api.loot.table(selected!, env),
    enabled: !!selected,
    staleTime: 60_000,
  });

  if (isLoading) return <LoadingGrid message="LOADING LOOT TABLES…" />;
  if (error) return <ErrorState error={error as Error} onRetry={() => void refetch()} />;

  const needle = debounced.trim().toLowerCase();
  const tables = (list?.data ?? []).filter(
    (table) => !needle || (table.name ?? table.class_name).toLowerCase().includes(needle),
  );

  return (
    <PageShell size="xl">
      <div>
        <h1 className="font-orbitron text-3xl font-black text-slate-100">Loot Tables</h1>
        <p className="text-sm text-slate-500 mt-1">
          What can drop, and how often. Chances are each entry's weight as a share of its table.
        </p>
      </div>

      <div className="sci-panel flex items-center gap-2 px-3 py-2">
        <Search size={14} className="text-slate-600 shrink-0" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter tables…"
          className="w-full bg-transparent text-sm font-rajdhani text-slate-200 placeholder:text-slate-600 focus:outline-none"
        />
        <span className="font-mono-sc text-[10px] text-slate-600 shrink-0">{tables.length}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <ScifiPanel title="Tables" subtitle={`${tables.length} of ${list?.total ?? 0}`} actions={<Boxes size={14} className="text-cyan-700" />}>
          <div className="space-y-1 max-h-[36rem] overflow-y-auto">
            {tables.map((table) => (
              <button
                type="button"
                key={table.uuid}
                onClick={() => setSelected(table.uuid)}
                className={`w-full text-left sci-panel px-3 py-2 flex items-center justify-between gap-3 transition-colors ${
                  selected === table.uuid ? 'border-cyan-800 text-cyan-300' : 'hover:border-slate-700'
                }`}
              >
                <span className="text-sm font-rajdhani text-slate-300 truncate">{table.name ?? table.class_name}</span>
                <span className="font-mono-sc text-[10px] text-slate-600 shrink-0">{table.entry_count}</span>
              </button>
            ))}
          </div>
        </ScifiPanel>

        {detail && (
          <ScifiPanel title={detail.name ?? detail.class_name} subtitle={`${detail.entry_count} entries`}>
            <div className="space-y-1 max-h-[36rem] overflow-y-auto">
              {detail.entries.map((entry) => (
                <div key={entry.entry_index} className="sci-panel px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-rajdhani text-slate-300 truncate">{entry.archetype_name ?? '—'}</span>
                    <span className="font-mono-sc text-xs text-cyan-300 tabular-nums shrink-0">
                      {entry.chance_pct == null ? '—' : `${entry.chance_pct}%`}
                    </span>
                  </div>
                  {entry.yields.length > 0 && (
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{entry.yields.join(', ')}</p>
                  )}
                  {/* La quantité n'est renseignée que sur 244 des 709 entrées :
                      c'est la donnée du jeu, on ne l'invente pas quand elle manque. */}
                  {(entry.max_results ?? 0) > 0 && (
                    <p className="font-mono-sc text-[10px] text-slate-600 mt-0.5">
                      {entry.min_results}–{entry.max_results} per roll
                    </p>
                  )}
                </div>
              ))}
            </div>
          </ScifiPanel>
        )}

        {!detail && (
          <ScifiPanel title="Contents">
            <p className="text-xs text-slate-600 italic py-8 text-center">Pick a table to see what it drops.</p>
          </ScifiPanel>
        )}
      </div>
    </PageShell>
  );
}
