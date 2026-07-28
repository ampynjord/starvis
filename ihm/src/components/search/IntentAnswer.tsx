'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, MapPin, TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import type { Intent } from '@/lib/intent';
import { api } from '@/services/api';
import { fCredits } from '@/utils/formatters';
import type { CommodityPrice } from '@/types/api';

/**
 * Répond directement quand la recherche portait une question.
 *
 * « Où vendre de l'agricium » appelle un lieu et un prix, pas une liste de
 * marchandises à parcourir. Le panneau se place au-dessus des résultats
 * ordinaires, qui restent affichés : il ajoute une réponse, il ne remplace pas
 * la recherche.
 *
 * ── Ce qu'il refuse de faire ─────────────────────────────────────────────────
 *
 * Répondre sans certitude. S'il ne trouve pas la marchandise, ou qu'aucun prix
 * ne correspond au sens de la question, il ne s'affiche pas — la recherche
 * ordinaire prend le relais. Une réponse directe fausse coûte plus cher qu'une
 * liste.
 */
export function IntentAnswer({ intent, env }: { intent: Intent; env?: string }) {
  const { data: matches } = useQuery({
    queryKey: ['intent.commodity', intent.subject, env],
    queryFn: () => api.commodities.list({ search: intent.subject, limit: 5, env }),
  });

  // Le meilleur candidat est celui dont le nom correspond exactement ; à défaut,
  // le premier résultat. Un « agricium » saisi ne doit pas répondre pour
  // « Agricium Ore » si l'un des deux porte le nom exact.
  const wanted = intent.subject.toLowerCase();
  const commodity = (matches?.data ?? []).find((c) => c.name?.toLowerCase() === wanted) ?? matches?.data?.[0];

  const { data: prices } = useQuery({
    queryKey: ['trade.prices', commodity?.uuid, env],
    queryFn: () => api.trade.prices(commodity!.uuid, env),
    enabled: Boolean(commodity?.uuid),
  });

  if (!commodity) return null;

  // `buy_price` est ce qu'on paie, `sell_price` ce qu'on encaisse : vendre veut
  // le mieux payé, acheter le moins cher.
  const candidates = (prices ?? []).filter((p) =>
    intent.kind === 'sell' ? p.sell_price != null && p.sell_price > 0 : p.buy_price != null && p.buy_price > 0,
  );
  if (!candidates.length) return null;

  const best = candidates.reduce<CommodityPrice>((winner, p) => {
    if (intent.kind === 'sell') return p.sell_price! > winner.sell_price! ? p : winner;
    return p.buy_price! < winner.buy_price! ? p : winner;
  }, candidates[0]);

  const price = intent.kind === 'sell' ? best.sell_price! : best.buy_price!;
  const place = [best.city, best.planet_moon, best.system].filter(Boolean).join(' · ');
  const verb = intent.kind === 'sell' ? 'Sell' : 'Buy';

  return (
    <ScifiPanel
      title={`${verb} ${commodity.name}`}
      subtitle={`Best of ${candidates.length} terminal${candidates.length !== 1 ? 's' : ''}`}
      actions={
        intent.kind === 'sell' ? (
          <TrendingUp size={14} className="text-amber-700" />
        ) : (
          <TrendingDown size={14} className="text-green-700" />
        )
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-lg font-rajdhani font-semibold text-slate-100">
            <MapPin size={14} className="text-slate-600 shrink-0" />
            {best.shop_name}
          </p>
          <p className="text-xs font-mono-sc text-slate-600 truncate">{place || '—'}</p>
        </div>

        <p className={`font-orbitron text-2xl font-black tabular-nums ${intent.kind === 'sell' ? 'text-amber-400' : 'text-green-400'}`}>
          {fCredits(price)}
        </p>
      </div>

      <Link
        href={`/commodities/${commodity.uuid}`}
        className="mt-3 inline-flex items-center gap-1 text-xs font-mono-sc text-cyan-500 hover:text-cyan-300 transition-colors"
      >
        All terminals and margin <ArrowRight size={11} />
      </Link>
    </ScifiPanel>
  );
}
