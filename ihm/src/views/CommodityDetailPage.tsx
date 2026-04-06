import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, MapPin, TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { CanonicalMeta } from '@/components/ui/CanonicalMeta';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { fCredits } from '@/utils/formatters';
import type { CommodityPrice } from '@/types/api';

function fmtNum(v: number | null | undefined, unit = '', digits = 2): string {
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return `${n.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
}

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

export default function CommodityDetailPage() {
  const params = useParams<{ uuid: string }>();
  const uuid = params?.uuid;
  const router = useRouter();
  const { env } = useEnv();

  const { data: commodity, isLoading, error, refetch } = useQuery({
    queryKey: ['commodities.get', uuid, env],
    queryFn: () => api.commodities.get(uuid!, env),
    enabled: !!uuid,
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
  const bestBuy = buyLocations.reduce<CommodityPrice | null>((best, p) => {
    if (best == null || p.buy_price! > best.buy_price!) return p;
    return best;
  }, null);
  const bestSell = sellLocations.reduce<CommodityPrice | null>((best, p) => {
    if (best == null || p.sell_price! < best.sell_price!) return p;
    return best;
  }, null);

  return (
    <div className="max-w-(--breakpoint-lg) mx-auto space-y-5">
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
      <div className="sci-panel p-6">
        <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-widest mb-1">{commodity.type ?? 'Commodity'}</p>
        <h1 className="font-orbitron text-2xl font-black text-slate-100">{commodity.name}</h1>
        <div className="flex flex-wrap gap-2 mt-3">
          {commodity.type && <GlowBadge color="slate">{commodity.type}</GlowBadge>}
          {commodity.sub_type && <GlowBadge color="slate">{commodity.sub_type}</GlowBadge>}
          {commodity.symbol && <GlowBadge color="cyan">{commodity.symbol}</GlowBadge>}
          {commodity.occupancy_scu != null && (
            <GlowBadge color="amber">{fmtNum(commodity.occupancy_scu, 'μSCU', 4)}</GlowBadge>
          )}
        </div>
        <CanonicalMeta
          className="mt-4"
          sourceType={commodity.source_type}
          sourceName={commodity.source_name}
          confidenceScore={commodity.confidence_score}
          canonicalKey={commodity.canonical_commodity_key}
          normalizedName={commodity.normalized_name}
        />
      </div>

      {/* Price summary */}
      {(bestBuy || bestSell) && (
        <div className="grid grid-cols-2 gap-3">
          {bestBuy && (
            <div className="sci-panel p-4">
              <p className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest mb-1">Best buy price</p>
              <p className="text-xl font-orbitron font-bold text-green-400">{fCredits(bestBuy.buy_price!)}</p>
              <p className="text-xs text-slate-500 mt-1 truncate">{bestBuy.shop_name}</p>
              <p className="text-[10px] text-slate-700 truncate">{bestBuy.system ?? '—'}</p>
            </div>
          )}
          {bestSell && (
            <div className="sci-panel p-4">
              <p className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest mb-1">Best sell price</p>
              <p className="text-xl font-orbitron font-bold text-amber-400">{fCredits(bestSell.sell_price!)}</p>
              <p className="text-xs text-slate-500 mt-1 truncate">{bestSell.shop_name}</p>
              <p className="text-[10px] text-slate-700 truncate">{bestSell.system ?? '—'}</p>
            </div>
          )}
        </div>
      )}

      {/* Buy locations */}
      {buyLocations.length > 0 && (
        <ScifiPanel
          title="Buy Locations"
          subtitle={`${buyLocations.length} location${buyLocations.length !== 1 ? 's' : ''}`}
          actions={<TrendingUp size={14} className="text-green-700" />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
            {buyLocations.sort((a, b) => (b.buy_price ?? 0) - (a.buy_price ?? 0)).map((p) => (
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
            {sellLocations.sort((a, b) => (a.sell_price ?? 0) - (b.sell_price ?? 0)).map((p) => (
              <PriceRow key={`sell-${p.id}`} price={{ ...p, buy_price: null }} />
            ))}
          </div>
        </ScifiPanel>
      )}

      {!prices?.length && !isLoading && (
        <ScifiPanel title="Trade Prices">
          <p className="text-xs text-slate-600 italic py-4 text-center">No price data available</p>
        </ScifiPanel>
      )}
    </div>
  );
}
