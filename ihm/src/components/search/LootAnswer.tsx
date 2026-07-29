'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Boxes } from 'lucide-react';
import Link from 'next/link';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import type { Intent } from '@/lib/intent';
import { api } from '@/services/api';

/** Ce qu'on retient d'une caisse : ses trois lots les plus probables. */
const SHOWN = 5;

/**
 * Répond « qu'est-ce qu'il y a dedans » quand la recherche le demandait.
 *
 * Une caisse ne dit rien par son nom. Ce qu'on veut savoir avant de l'ouvrir,
 * c'est la répartition — de la nourriture neuf fois sur dix, ou des munitions.
 *
 * ── Ce qu'il refuse de faire ─────────────────────────────────────────────────
 *
 * Choisir pour l'utilisateur entre deux caisses aussi plausibles. La
 * correspondance se fait sur le nom, et quand aucune table ne le porte, le
 * panneau se tait plutôt que de répondre pour une voisine.
 */
export function LootAnswer({ intent, env }: { intent: Intent; env?: string }) {
  const { data: tables } = useQuery({
    queryKey: ['loot.tables', env],
    queryFn: () => api.loot.tables({ env, limit: 200 }),
    staleTime: 60_000,
  });

  const wanted = intent.subject.toLowerCase().replace(/[^a-z0-9]/g, '');
  const candidates = (tables?.data ?? []).filter((table) =>
    (table.name ?? table.class_name).toLowerCase().replace(/[^a-z0-9]/g, '').includes(wanted),
  );
  // La plus fournie parmi celles qui correspondent : entre « Armor » et
  // « Armor Survival », celle qui a le plus d'entrées décrit le cas général.
  const table = candidates.sort((a, b) => b.entry_count - a.entry_count)[0];

  const { data: detail } = useQuery({
    queryKey: ['loot.table', table?.uuid, env],
    queryFn: () => api.loot.table(table!.uuid, env),
    enabled: Boolean(table?.uuid),
  });

  const entries = (detail?.entries ?? []).filter((entry) => entry.chance_pct != null);
  if (!table || entries.length === 0) return null;

  return (
    <ScifiPanel
      title={`Inside ${detail?.name ?? table.class_name}`}
      subtitle={`${detail?.entry_count ?? 0} entries${candidates.length > 1 ? ` · ${candidates.length} matching tables` : ''}`}
      actions={<Boxes size={14} className="text-cyan-700" />}
    >
      <div className="space-y-1">
        {entries.slice(0, SHOWN).map((entry) => (
          <div key={entry.entry_index} className="sci-panel px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-rajdhani text-slate-300 truncate">{entry.archetype_name ?? '—'}</span>
              <span className="font-mono-sc text-xs text-cyan-300 tabular-nums shrink-0">{entry.chance_pct}%</span>
            </div>
            {entry.yields.length > 0 && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{entry.yields.join(', ')}</p>}
          </div>
        ))}
      </div>
      <Link href="/loot" className="mt-3 inline-flex items-center gap-1 text-xs font-mono-sc text-cyan-700 hover:text-cyan-400">
        All loot tables <ArrowRight size={12} />
      </Link>
    </ScifiPanel>
  );
}
