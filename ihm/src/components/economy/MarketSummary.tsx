'use client';

import { Clock, Coins } from 'lucide-react';
import { fCredits } from '@/utils/formatters';

export interface MarketSummaryData {
  min_purchase_price?: number | string | null;
  min_rental_price_1d?: number | string | null;
  min_rental_price_3d?: number | string | null;
  min_rental_price_7d?: number | string | null;
  min_rental_price_30d?: number | string | null;
  purchase_location_count?: number | string | null;
  rental_location_count?: number | string | null;
}

function toNumber(value: number | string | null | undefined) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function marketSummaryValues(item: MarketSummaryData) {
  const purchase = toNumber(item.min_purchase_price);
  const rental =
    toNumber(item.min_rental_price_1d) ??
    toNumber(item.min_rental_price_3d) ??
    toNumber(item.min_rental_price_7d) ??
    toNumber(item.min_rental_price_30d);
  const purchaseLocations = toNumber(item.purchase_location_count);
  const rentalLocations = toNumber(item.rental_location_count);
  return { purchase, rental, purchaseLocations, rentalLocations, hasMarket: purchase != null || rental != null };
}

export function MarketSummary({ item, compact = false }: { item: MarketSummaryData; compact?: boolean }) {
  const { purchase, rental, purchaseLocations, rentalLocations, hasMarket } = marketSummaryValues(item);
  if (!hasMarket) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-right">
        {purchase != null && <span className="font-mono-sc text-[10px] text-amber-300">Buy {fCredits(purchase)}</span>}
        {rental != null && <span className="font-mono-sc text-[10px] text-blue-300">Rent {fCredits(rental)}</span>}
      </div>
    );
  }

  return (
    <div className="sci-panel flex items-center justify-between gap-3 px-3 py-2">
      <div className="flex min-w-0 items-center gap-1.5 text-slate-600">
        <Coins size={10} />
        <span className="font-mono-sc text-[9px] uppercase tracking-wide">Market</span>
      </div>
      <div className="min-w-0 text-right">
        {purchase != null && (
          <p className="truncate font-mono-sc text-[11px] text-amber-300">
            Buy {fCredits(purchase)}
            {purchaseLocations ? <span className="ml-1 text-slate-600">({purchaseLocations})</span> : null}
          </p>
        )}
        {rental != null && (
          <p className="flex items-center justify-end gap-1 truncate font-mono-sc text-[10px] text-blue-300">
            <Clock size={9} /> Rent from {fCredits(rental)}
            {rentalLocations ? <span className="text-slate-600">({rentalLocations})</span> : null}
          </p>
        )}
      </div>
    </div>
  );
}
