'use client';

import { Clock, MapPin, Package, TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { CanonicalMeta } from '@/components/ui/CanonicalMeta';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { fCredits } from '@/utils/formatters';

export interface PriceAvailabilityRow {
  shop_id: number;
  shop_name: string;
  location?: string | null;
  system?: string | null;
  system_name?: string | null;
  city?: string | null;
  planet_moon?: string | null;
  shop_type?: string | null;
  terminal?: string | null;
  match_type?: string | null;
  inventory_kind?: string | null;
  base_price?: number | string | null;
  sell_price?: number | string | null;
  current_inventory?: number | string | null;
  max_inventory?: number | string | null;
  inventory?: number | string | null;
  rental_price_1d?: number | string | null;
  rental_price_3d?: number | string | null;
  rental_price_7d?: number | string | null;
  rental_price_30d?: number | string | null;
  confidence_score?: number | string | null;
  confidence?: number | string | null;
  shop_source_type?: string | null;
  shop_source_name?: string | null;
  inventory_source_type?: string | null;
  inventory_source_name?: string | null;
  source_type?: string | null;
  source_name?: string | null;
}

function toNumber(value: number | string | null | undefined) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function locationLabel(row: PriceAvailabilityRow) {
  return [row.location, row.city, row.planet_moon, row.system ?? row.system_name].filter(Boolean).join(' · ') || 'Unknown location';
}

function stockLabel(row: PriceAvailabilityRow) {
  const current = toNumber(row.current_inventory ?? row.inventory);
  const max = toNumber(row.max_inventory);
  if (current == null && max == null) return null;
  const currentText = current == null ? '—' : current.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const maxText = max == null ? null : max.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return maxText ? `${currentText} / ${maxText}` : currentText;
}

function rentalRows(row: PriceAvailabilityRow) {
  const rows: [string, number | null][] = [
    ['1d', toNumber(row.rental_price_1d)],
    ['3d', toNumber(row.rental_price_3d)],
    ['7d', toNumber(row.rental_price_7d)],
    ['30d', toNumber(row.rental_price_30d)],
  ];
  return rows.filter((entry): entry is [string, number] => entry[1] != null && entry[1] > 0);
}

export function PriceAvailabilityPanel({
  title = 'Purchase & Rental',
  emptyMessage = 'No extracted purchase or rental locations.',
  rows,
}: {
  title?: string;
  emptyMessage?: string;
  rows?: PriceAvailabilityRow[];
}) {
  const purchasable = (rows ?? []).filter((row) => {
    const hasPrice = toNumber(row.base_price) != null || toNumber(row.sell_price) != null;
    return hasPrice || rentalRows(row).length > 0 || stockLabel(row) != null;
  });

  return (
    <ScifiPanel
      title={title}
      subtitle={purchasable.length ? `${purchasable.length} extracted location${purchasable.length !== 1 ? 's' : ''}` : 'Not found'}
      actions={<MapPin size={14} className="text-slate-600" />}
    >
      {!purchasable.length ? (
        <div className="py-5 text-center">
          <p className="text-sm font-rajdhani text-slate-400">{emptyMessage}</p>
          <p className="mt-1 text-xs text-slate-600">This may be stock-only, event-only, not sold in-game, or absent from current extracted shop data.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {purchasable.map((row, index) => {
            const base = toNumber(row.base_price);
            const sell = toNumber(row.sell_price);
            const rentals = rentalRows(row);
            const stock = stockLabel(row);
            const sourceType = row.inventory_source_type ?? row.source_type ?? row.shop_source_type;
            const sourceName = row.inventory_source_name ?? row.source_name ?? row.shop_source_name;

            return (
              <div key={`${row.shop_id}-${row.terminal ?? ''}-${index}`} className="sci-panel px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/starmap?shop=${row.shop_id}`} className="text-sm text-slate-300 hover:text-cyan-300 transition-colors truncate block">
                      {row.shop_name}
                    </Link>
                    <p className="text-xs text-slate-600 truncate">{locationLabel(row)}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {row.shop_type && <GlowBadge color="slate">{row.shop_type}</GlowBadge>}
                      {row.terminal && <GlowBadge color="cyan">{row.terminal}</GlowBadge>}
                      {row.match_type && <GlowBadge color={row.match_type === 'uuid' ? 'green' : 'cyan'}>{row.match_type}</GlowBadge>}
                    </div>
                    <CanonicalMeta
                      compact
                      className="mt-1"
                      sourceType={sourceType}
                      sourceName={sourceName}
                      confidenceScore={toNumber(row.confidence_score ?? row.confidence)}
                    />
                  </div>
                  <div className="shrink-0 text-right">
                    {base != null && base > 0 && (
                      <p className="flex items-center justify-end gap-1 text-xs font-mono-sc text-amber-400">
                        <TrendingUp size={9} /> {fCredits(base)}
                      </p>
                    )}
                    {sell != null && sell > 0 && (
                      <p className="mt-1 flex items-center justify-end gap-1 text-[10px] font-mono-sc text-red-400">
                        <TrendingDown size={9} /> Sell {fCredits(sell)}
                      </p>
                    )}
                    {rentals.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {rentals.map(([label, value]) => (
                          <p key={label} className="flex items-center justify-end gap-1 text-[10px] font-mono-sc text-blue-300">
                            <Clock size={9} /> {label} {fCredits(value)}
                          </p>
                        ))}
                      </div>
                    )}
                    {base == null && sell == null && rentals.length === 0 && (
                      <p className="text-xs font-mono-sc text-slate-600">Price unknown</p>
                    )}
                  </div>
                </div>
                {stock && (
                  <p className="mt-2 flex items-center gap-1 border-t border-slate-900 pt-1.5 font-mono-sc text-[10px] text-slate-600">
                    <Package size={10} /> Stock {stock}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ScifiPanel>
  );
}
