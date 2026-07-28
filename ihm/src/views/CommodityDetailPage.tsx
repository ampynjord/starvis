'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, MapPin, Package, TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { PageShell } from '@/components/ui/PageShell';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { fCredits } from '@/utils/formatters';
import type { Commodity, CommodityPrice } from '@/types/api';

function fmtNum(v: number | null | undefined, unit = '', digits = 2): string {
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return `${n.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
}

// ── Quick stat pill ───────────────────────────────────────────────────────────

function QuickStat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  if (value === '—') return null;
  return (
    <div className="flex flex-col items-center gap-1 rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3 min-w-[72px]">
      <div className="flex items-center gap-1 text-slate-600">
        {icon}
        <span className="text-[9px] font-mono-sc uppercase tracking-widest">{label}</span>
      </div>
      <span className={`text-sm font-orbitron font-bold tabular-nums ${accent ?? 'text-slate-200'}`}>{value}</span>
    </div>
  );
}

// ── Price row ─────────────────────────────────────────────────────────────────

function PriceRow({ price }: { price: CommodityPrice }) {
  const hasBuy = price.buy_price != null && price.buy_price > 0;
  const hasSell = price.sell_price != null && price.sell_price > 0;

  return (
    <div className="sci-panel px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-rajdhani font-semibold text-slate-300 truncate">{price.shop_name}</p>
          <p className="text-xs text-slate-600 truncate">
            {[price.city, price.planet_moon, price.system].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {hasBuy && (
            <span className="flex items-center gap-1 text-xs font-mono-sc text-green-400">
              <TrendingUp size={9} /> {fCredits(price.buy_price!)}
            </span>
          )}
          {hasSell && (
            <span className="flex items-center gap-1 text-xs font-mono-sc text-red-400">
              <TrendingDown size={9} /> {fCredits(price.sell_price!)}
            </span>
          )}
          {!hasBuy && !hasSell && (
            <span className="text-xs font-mono-sc text-slate-700">—</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** `initialCommodity` : voir ShipDetailPage — rend la fiche dès le rendu serveur. */
export default function CommodityDetailPage({ initialCommodity }: { initialCommodity?: Commodity | null } = {}) {
  const params = useParams<{ uuid: string }>();
  const uuid = params?.uuid;
  const router = useRouter();
  const { env } = useEnv();

  // La page serveur interroge toujours LIVE : ne réutiliser sa réponse que là.
  const seedCommodity = env === 'live' && initialCommodity && initialCommodity.uuid === uuid ? initialCommodity : undefined;

  const { data: commodity, isLoading, error, refetch } = useQuery({
    queryKey: ['commodities.get', uuid, env],
    queryFn: () => api.commodities.get(uuid!, env),
    enabled: !!uuid,
    initialData: seedCommodity,
  });

  const { data: prices } = useQuery({
    queryKey: ['trade.prices', uuid, env],
    queryFn: () => api.trade.prices(uuid!, env),
    enabled: !!uuid,
  });

  if (isLoading) return <LoadingGrid message="LOADING COMMODITY…" />;
  if (error) return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!commodity) return null;

  const buyLocations = (prices ?? []).filter((p) => p.buy_price != null && p.buy_price > 0);
  const sellLocations = (prices ?? []).filter((p) => p.sell_price != null && p.sell_price > 0);

  // `buy_price` est ce qu'on paie pour acquérir, `sell_price` ce qu'on encaisse
  // en revendant — la recherche de routes de l'API le confirme, elle n'accepte
  // une route que si `sell_price > buy_price`.
  //
  // Le meilleur endroit où acheter est donc le **moins cher**, et le meilleur
  // endroit où vendre le **mieux payé**. Les deux comparaisons étaient inversées
  // et présentaient au commerçant exactement les pires prix, sous les libellés
  // « Best buy » et « Best sell ».
  const bestBuy = buyLocations.reduce<CommodityPrice | null>((best, p) => (best == null || p.buy_price! < best.buy_price! ? p : best), null);
  const bestSell = sellLocations.reduce<CommodityPrice | null>(
    (best, p) => (best == null || p.sell_price! > best.sell_price! ? p : best),
    null,
  );

  // Le calcul que le commerçant vient chercher, dans la fiche plutôt qu'à côté.
  // Une marge n'a de sens que si les deux extrémités existent et qu'elle est
  // positive : afficher une route perdante serait pire que ne rien afficher.
  const margin = bestBuy && bestSell ? bestSell.sell_price! - bestBuy.buy_price! : null;
  const marginPct = margin != null && bestBuy!.buy_price! > 0 ? (margin / bestBuy!.buy_price!) * 100 : null;
  const profitableRoute = margin != null && margin > 0 ? { buy: bestBuy!, sell: bestSell!, margin, marginPct } : null;

  const typeInitials = (commodity.type ?? 'COM').slice(0, 3).toUpperCase();

  return (
    <PageShell size="xl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-mono-sc text-slate-600">
        <button type="button" onClick={() => router.back()} className="hover:text-slate-400 transition-colors flex items-center gap-1">
          <ArrowLeft size={12} /> Back
        </button>
        <ChevronRight size={10} />
        <Link href="/trade" className="hover:text-slate-400">Trade Goods</Link>
        <ChevronRight size={10} />
        <span className="text-slate-400">{commodity.name}</span>
      </div>

      {/* Hero */}
      <div className="sci-panel overflow-hidden">
        {/* Image placeholder */}
        <div className="relative w-full h-48 bg-slate-900">
          <div className="w-full h-full flex items-center justify-center">
            <span className="font-orbitron text-6xl font-black text-slate-800 select-none tracking-widest">
              {typeInitials}
            </span>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-[#0A1628] to-transparent" />
        </div>

        {/* Header info */}
        <div className="px-6 pb-6 -mt-8 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-widest mb-1">{commodity.type ?? 'Commodity'}</p>
              <h1 className="font-orbitron text-3xl font-black text-slate-100 leading-tight">{commodity.name}</h1>
              <div className="flex flex-wrap gap-2 mt-3">
                {commodity.type && <GlowBadge color="slate">{commodity.type}</GlowBadge>}
                {commodity.sub_type && <GlowBadge color="slate">{commodity.sub_type}</GlowBadge>}
                {commodity.symbol && <GlowBadge color="cyan">{commodity.symbol}</GlowBadge>}
                {commodity.occupancy_scu != null && (
                  <GlowBadge color="amber">{fmtNum(commodity.occupancy_scu, 'μSCU', 4)}</GlowBadge>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats — best prices */}
      {(bestBuy || bestSell || commodity.occupancy_scu != null) && (
        <div className="flex gap-2 flex-wrap">
          {bestBuy && (
            <QuickStat
              icon={<TrendingUp size={9} />}
              label="Best buy"
              value={fCredits(bestBuy.buy_price!)}
              accent="text-green-400"
            />
          )}
          {bestSell && (
            <QuickStat
              icon={<TrendingDown size={9} />}
              label="Best sell"
              value={fCredits(bestSell.sell_price!)}
              accent="text-amber-400"
            />
          )}
          {buyLocations.length > 0 && (
            <QuickStat
              icon={<MapPin size={9} />}
              label="Buy locs"
              value={String(buyLocations.length)}
            />
          )}
          {sellLocations.length > 0 && (
            <QuickStat
              icon={<MapPin size={9} />}
              label="Sell locs"
              value={String(sellLocations.length)}
            />
          )}
          {commodity.occupancy_scu != null && (
            <QuickStat
              icon={<Package size={9} />}
              label="Density"
              value={fmtNum(commodity.occupancy_scu, 'μSCU', 4)}
            />
          )}
        </div>
      )}

      {/* Meilleure route — le calcul dans la fiche, pas dans un outil à côté */}
      {profitableRoute && (
        <ScifiPanel title="Best Route" subtitle="Cheapest purchase → highest payout" actions={<Package size={14} className="text-cyan-700" />}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
            <div className="sci-panel px-4 py-3">
              <p className="text-[9px] font-mono-sc uppercase tracking-widest text-slate-600 mb-1">Buy at</p>
              <p className="text-sm font-rajdhani font-semibold text-slate-200 truncate">{profitableRoute.buy.shop_name}</p>
              <p className="text-xs text-slate-600 truncate">
                {[profitableRoute.buy.city, profitableRoute.buy.planet_moon, profitableRoute.buy.system].filter(Boolean).join(' · ') || '—'}
              </p>
              <p className="mt-2 text-sm font-mono-sc text-green-400">{fCredits(profitableRoute.buy.buy_price!)}</p>
            </div>

            <div className="sci-panel px-4 py-3">
              <p className="text-[9px] font-mono-sc uppercase tracking-widest text-slate-600 mb-1">Sell at</p>
              <p className="text-sm font-rajdhani font-semibold text-slate-200 truncate">{profitableRoute.sell.shop_name}</p>
              <p className="text-xs text-slate-600 truncate">
                {[profitableRoute.sell.city, profitableRoute.sell.planet_moon, profitableRoute.sell.system].filter(Boolean).join(' · ') ||
                  '—'}
              </p>
              <p className="mt-2 text-sm font-mono-sc text-amber-400">{fCredits(profitableRoute.sell.sell_price!)}</p>
            </div>

            <div className="sci-panel px-4 py-3 flex flex-col justify-center">
              <p className="text-[9px] font-mono-sc uppercase tracking-widest text-slate-600 mb-1">Margin per unit</p>
              <p className="text-xl font-orbitron font-black text-cyan-300 tabular-nums">{fCredits(profitableRoute.margin)}</p>
              {profitableRoute.marginPct != null && (
                <p className="text-xs font-mono-sc text-slate-500">+{profitableRoute.marginPct.toFixed(1)}%</p>
              )}
            </div>
          </div>
        </ScifiPanel>
      )}

      {/* Locations grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* Buy locations */}
        {buyLocations.length > 0 && (
          <ScifiPanel
            title="Buy Locations"
            subtitle={`${buyLocations.length} location${buyLocations.length !== 1 ? 's' : ''}`}
            actions={<TrendingUp size={14} className="text-green-700" />}
          >
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {/* Le moins cher d'abord : c'est celui-là qu'on cherche pour acheter. */}
              {[...buyLocations].sort((a, b) => (a.buy_price ?? 0) - (b.buy_price ?? 0)).map((p) => (
                <PriceRow key={`buy-${p.id}`} price={{ ...p, sell_price: null }} />
              ))}
            </div>
          </ScifiPanel>
        )}

        {/* Sell locations */}
        {sellLocations.length > 0 && (
          <ScifiPanel
            title="Sell Locations"
            subtitle={`${sellLocations.length} location${sellLocations.length !== 1 ? 's' : ''}`}
            actions={<MapPin size={14} className="text-amber-700" />}
          >
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {/* Le mieux payé d'abord. */}
              {[...sellLocations].sort((a, b) => (b.sell_price ?? 0) - (a.sell_price ?? 0)).map((p) => (
                <PriceRow key={`sell-${p.id}`} price={{ ...p, buy_price: null }} />
              ))}
            </div>
          </ScifiPanel>
        )}
      </div>

      {!prices?.length && !isLoading && (
        <ScifiPanel title="Trade Prices">
          <p className="text-xs text-slate-600 italic py-4 text-center">No price data available</p>
        </ScifiPanel>
      )}
    </PageShell>
  );
}
