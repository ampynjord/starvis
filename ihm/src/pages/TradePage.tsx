/**
 * TradePage — Commodity trade route finder + price explorer
 * Inspired by uexcorp.space trade simulator
 */
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Package, ChevronDown, Search, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/services/api';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { fNumber } from '@/utils/formatters';
import type { TradeRoute, CommodityPrice } from '@/types/api';

// ── Sub-components ────────────────────────────────────────────────────────────

function RouteRow({ route, rank }: { route: TradeRoute; rank: number }) {
  const profitColor =
    route.profit_per_scu > 20 ? 'text-green-400' :
    route.profit_per_scu > 10 ? 'text-amber-400' : 'text-slate-400';

  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.03 }}
      className="border-b border-slate-900 hover:bg-white/[0.02] transition-colors"
    >
      <td className="py-2 px-3">
        <span className="text-xs font-mono-sc text-slate-600">#{rank + 1}</span>
      </td>
      <td className="py-2 px-3">
        <div className="text-xs font-rajdhani font-semibold text-slate-200">{route.commodity_name}</div>
        {route.commodity_symbol && (
          <div className="text-[10px] text-slate-600 font-mono-sc">{route.commodity_symbol}</div>
        )}
      </td>
      <td className="py-2 px-3">
        <div className="text-xs text-slate-300">{route.buy_location}</div>
        {route.buy_system && <div className="text-[10px] text-slate-600">{route.buy_system}</div>}
      </td>
      <td className="py-2 px-3 text-right font-mono-sc text-xs text-slate-400">
        {fNumber(route.buy_price, 2)} aUEC
      </td>
      <td className="py-2 px-3">
        <div className="text-xs text-slate-300">{route.sell_location}</div>
        {route.sell_system && <div className="text-[10px] text-slate-600">{route.sell_system}</div>}
      </td>
      <td className="py-2 px-3 text-right font-mono-sc text-xs text-slate-400">
        {fNumber(route.sell_price, 2)} aUEC
      </td>
      <td className={`py-2 px-3 text-right font-mono-sc text-xs font-bold ${profitColor}`}>
        +{fNumber(route.profit_per_scu, 2)}/SCU
      </td>
      <td className={`py-2 px-3 text-right font-mono-sc text-xs ${profitColor}`}>
        {fNumber(route.total_profit, 0)} aUEC
      </td>
    </motion.tr>
  );
}

function PriceRow({ price }: { price: CommodityPrice }) {
  const hasBuy  = price.buy_price != null && price.buy_price > 0;
  const hasSell = price.sell_price != null && price.sell_price > 0;
  return (
    <tr className="border-b border-slate-900 hover:bg-white/[0.02] transition-colors text-xs">
      <td className="py-1.5 px-3 font-rajdhani text-slate-200">{price.commodity_name}</td>
      <td className="py-1.5 px-3 text-slate-400">{price.location_name}</td>
      <td className="py-1.5 px-3 text-slate-600">{price.system_name ?? '—'}</td>
      <td className="py-1.5 px-3 text-right font-mono-sc text-cyan-400">
        {hasBuy ? `${fNumber(price.buy_price!, 2)} aUEC` : '—'}
      </td>
      <td className="py-1.5 px-3 text-right font-mono-sc text-amber-400">
        {hasSell ? `${fNumber(price.sell_price!, 2)} aUEC` : '—'}
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TradePage() {
  const [tab, setTab] = useState<'routes' | 'prices'>('routes');
  const [cargoScu, setCargoScu] = useState(100);
  const [system, setSystem] = useState('');
  const [priceFilter, setPriceFilter] = useState('');

  const { data: routes, isLoading: routesLoading } = useQuery({
    queryKey: ['trade.routes', cargoScu, system],
    queryFn: () => api.trade.routes({ cargo_scu: cargoScu, system: system || undefined }),
    staleTime: 2 * 60_000,
  });

  const { data: prices, isLoading: pricesLoading } = useQuery({
    queryKey: ['trade.prices', system],
    queryFn: () => api.trade.prices({ system: system || undefined }),
    enabled: tab === 'prices',
    staleTime: 2 * 60_000,
  });

  const filteredPrices = prices?.filter(p =>
    !priceFilter || p.commodity_name.toLowerCase().includes(priceFilter.toLowerCase())
  );

  const hasData = (routes?.length ?? 0) > 0 || (prices?.length ?? 0) > 0;
  const isEmpty = !routesLoading && !pricesLoading && !hasData;

  return (
    <div className="max-w-screen-xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase flex items-center gap-2">
            <TrendingUp size={18} />
            Trade Simulator
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Find the best commodity trade routes across the verse</p>
        </div>
        {/* Filters row */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 border border-slate-800 rounded">
            <Package size={12} className="text-slate-600" />
            <span className="text-[10px] font-mono-sc text-slate-600 uppercase">Cargo</span>
            <input
              type="number"
              min={1}
              max={10000}
              value={cargoScu}
              onChange={e => setCargoScu(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 bg-transparent text-xs text-cyan-400 font-mono-sc text-right focus:outline-none"
            />
            <span className="text-[10px] text-slate-700 font-mono-sc">SCU</span>
          </div>
          <div className="relative">
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
            <select
              value={system}
              onChange={e => setSystem(e.target.value)}
              className="sci-input pr-7 text-xs appearance-none"
            >
              <option value="">All systems</option>
              <option value="Stanton">Stanton</option>
              <option value="Pyro">Pyro</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        {([['routes', 'Best Routes'], ['prices', 'All Prices']] as [string, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key as 'routes' | 'prices')}
            className={`px-4 py-2 text-xs font-mono-sc uppercase transition-all border-b-2 -mb-px ${
              tab === key
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-600 hover:text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ── Routes tab ── */}
        {tab === 'routes' && (
          <motion.div key="routes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {routesLoading ? (
              <LoadingGrid message="FETCHING ROUTES…" />
            ) : isEmpty ? (
              <ScifiPanel title="No trade data available">
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <AlertCircle size={28} className="text-slate-700" />
                  <p className="text-sm text-slate-600 font-rajdhani max-w-sm">
                    Trade prices are not yet extracted from game files.
                    This page will populate automatically once the extractor runs.
                  </p>
                  <div className="text-[10px] text-slate-700 font-mono-sc">
                    commodity_prices table is empty — run extractor to populate
                  </div>
                </div>
              </ScifiPanel>
            ) : (
              <ScifiPanel
                title={`Top Routes · ${routes?.length ?? 0} found`}
                subtitle={`${cargoScu} SCU · ${system || 'all systems'}`}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[800px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 text-[10px] font-mono-sc text-slate-700 w-8">#</th>
                        <th className="text-left py-2 px-3 text-[10px] font-mono-sc text-slate-700">Commodity</th>
                        <th className="text-left py-2 px-3 text-[10px] font-mono-sc text-slate-700">Buy at</th>
                        <th className="text-right py-2 px-3 text-[10px] font-mono-sc text-slate-700">Buy price</th>
                        <th className="text-left py-2 px-3 text-[10px] font-mono-sc text-slate-700">Sell at</th>
                        <th className="text-right py-2 px-3 text-[10px] font-mono-sc text-slate-700">Sell price</th>
                        <th className="text-right py-2 px-3 text-[10px] font-mono-sc text-cyan-700">Profit/SCU</th>
                        <th className="text-right py-2 px-3 text-[10px] font-mono-sc text-cyan-700">Total ({cargoScu} SCU)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routes?.map((r, i) => <RouteRow key={`${r.commodity_uuid}-${r.buy_location}-${r.sell_location}`} route={r} rank={i} />)}
                    </tbody>
                  </table>
                </div>
              </ScifiPanel>
            )}
          </motion.div>
        )}

        {/* ── Prices tab ── */}
        {tab === 'prices' && (
          <motion.div key="prices" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className="relative w-56">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
              <input
                type="text"
                value={priceFilter}
                onChange={e => setPriceFilter(e.target.value)}
                placeholder="Filter commodity…"
                className="sci-input w-full pl-7 text-xs"
              />
            </div>

            {pricesLoading ? (
              <LoadingGrid message="FETCHING PRICES…" />
            ) : !filteredPrices?.length ? (
              <ScifiPanel title="No price data">
                <div className="py-8 text-center text-sm text-slate-600 font-rajdhani">
                  No commodity prices available yet.
                </div>
              </ScifiPanel>
            ) : (
              <ScifiPanel title={`Prices · ${filteredPrices.length} entries`}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 text-[10px] font-mono-sc text-slate-700">Commodity</th>
                        <th className="text-left py-2 px-3 text-[10px] font-mono-sc text-slate-700">Location</th>
                        <th className="text-left py-2 px-3 text-[10px] font-mono-sc text-slate-700">System</th>
                        <th className="text-right py-2 px-3 text-[10px] font-mono-sc text-cyan-700">Buy price</th>
                        <th className="text-right py-2 px-3 text-[10px] font-mono-sc text-amber-700">Sell price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {filteredPrices.map((p, i) => (
                        <PriceRow key={`${p.commodity_uuid}-${p.location_name}-${i}`} price={p} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScifiPanel>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-2 border-t border-slate-900">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-700 font-mono-sc uppercase">
          <div className="w-2 h-2 rounded-full bg-green-400" /> Profit ≥ 20/SCU
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-700 font-mono-sc uppercase">
          <div className="w-2 h-2 rounded-full bg-amber-400" /> Profit 10–20/SCU
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-700 font-mono-sc uppercase">
          <div className="w-2 h-2 rounded-full bg-slate-600" /> Profit &lt; 10/SCU
        </div>
      </div>
    </div>
  );
}
