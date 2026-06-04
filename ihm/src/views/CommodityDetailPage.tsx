'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp, MapPin, Package, TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { PageShell } from '@/components/ui/PageShell';
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

export default function CommodityDetailPage() {
  const params = useParams<{ uuid: string }>();
  const uuid = params?.uuid;
  const router = useRouter();
  const { env } = useEnv();
  const [rawOpen, setRawOpen] = useState(false);

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

      {/* Canonical meta */}
      <CanonicalMeta
        sourceType={commodity.source_type}
        sourceName={commodity.source_name}
        confidenceScore={commodity.confidence_score}
        canonicalKey={commodity.canonical_commodity_key}
        normalizedName={commodity.normalized_name}
      />

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
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {sellLocations.sort((a, b) => (a.sell_price ?? 0) - (b.sell_price ?? 0)).map((p) => (
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

      {/* Identification + raw data */}
      {(commodity.class_name || commodity.data_json) && (
        <div className="space-y-3">
          {commodity.class_name && (
            <ScifiPanel title="Identification">
              <p className="text-xs font-mono-sc text-slate-500 break-all">{commodity.class_name}</p>
            </ScifiPanel>
          )}
          {commodity.data_json && Object.keys(commodity.data_json).length > 0 && (
            <div className="sci-panel overflow-hidden">
              <button
                type="button"
                onClick={() => setRawOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-mono-sc text-slate-500 hover:text-slate-300 transition-colors"
              >
                <span className="uppercase tracking-widest">Raw Game Data</span>
                {rawOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {rawOpen && (
                <pre className="px-4 pb-4 max-h-80 overflow-auto text-xs text-slate-500 font-mono leading-relaxed border-t border-border">
                  {JSON.stringify(commodity.data_json, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
