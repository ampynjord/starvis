import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, DollarSign, Filter, MapPin, Package, Plus, Search, SortDesc, TrendingUp, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import type { Commodity, Shop, TradeRoute } from '@/types/api';
import { useDebounce } from '@/hooks/useDebounce';

const SCU_PRESETS = [4, 8, 16, 32, 46, 96, 174, 576, 696];
const SORT_OPTIONS = [
  { value: 'totalProfit', label: 'Total Profit' },
  { value: 'profitPerScu', label: 'Profit / SCU' },
  { value: 'profitPerUnit', label: 'Profit / Unit' },
] as const;

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export default function TradePage() {
  const { env } = useEnv();
  const queryClient = useQueryClient();

  // Route calculator state
  const [scu, setScu] = useState(46);
  const [budget, setBudget] = useState('');
  const [commoditySearch, setCommoditySearch] = useState('');
  const [buySystem, setBuySystem] = useState('');
  const [sellSystem, setSellSystem] = useState('');
  const [sort, setSort] = useState<string>('totalProfit');

  const debouncedCommodity = useDebounce(commoditySearch, 350);

  // Price report state
  const [reportCommodityUuid, setReportCommodityUuid] = useState('');
  const [reportShopId, setReportShopId] = useState('');
  const [reportBuyPrice, setReportBuyPrice] = useState('');
  const [reportSellPrice, setReportSellPrice] = useState('');

  // Data queries
  const { data: commodities } = useQuery({
    queryKey: ['commodities.list', env],
    queryFn: () => api.commodities.list({ env, limit: 500 }),
    staleTime: Infinity,
  });

  const { data: shops } = useQuery({
    queryKey: ['shops.list', env],
    queryFn: () => api.shops.list({ env }),
    staleTime: Infinity,
  });

  const { data: systems } = useQuery({
    queryKey: ['trade.systems', env],
    queryFn: () => api.trade.systems(env),
    staleTime: Infinity,
  });

  const {
    data: routes,
    isLoading: routesLoading,
    error: routesError,
    refetch: refetchRoutes,
  } = useQuery({
    queryKey: ['trade.routes', env, scu, budget, debouncedCommodity, buySystem, sellSystem, sort],
    queryFn: () =>
      api.trade.routes(scu, {
        budget: budget ? Number(budget) : undefined,
        commodity: debouncedCommodity || undefined,
        buySystem: buySystem || undefined,
        sellSystem: sellSystem || undefined,
        sort: sort || undefined,
        env,
        limit: 30,
      }),
    enabled: scu > 0,
  });

  // Price report mutation
  const reportMutation = useMutation({
    mutationFn: (data: { commodityUuid: string; shopId: number; buyPrice?: number; sellPrice?: number }) =>
      api.trade.reportPrice({ ...data, env }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade'] });
      setReportBuyPrice('');
      setReportSellPrice('');
    },
  });

  const commodityShops = useMemo(() => {
    if (!shops?.data?.length) return [];
    return shops.data.filter(
      (s: Shop) => s.shop_type === 'Commodities' || s.shop_type === 'General',
    );
  }, [shops]);

  const handleReport = () => {
    if (!reportCommodityUuid || !reportShopId) return;
    const bp = reportBuyPrice ? Number(reportBuyPrice) : undefined;
    const sp = reportSellPrice ? Number(reportSellPrice) : undefined;
    if (bp == null && sp == null) return;
    reportMutation.mutate({
      commodityUuid: reportCommodityUuid,
      shopId: Number(reportShopId),
      buyPrice: bp,
      sellPrice: sp,
    });
  };

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="mb-4">
        <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">Trade Routes</h1>
        <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">Trade route calculator</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
        {/* Main content */}
        <div className="space-y-4">
          {/* Route calculator */}
          <ScifiPanel title="Route Calculator" subtitle="Find the most profitable routes">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="text-xs font-mono-sc text-slate-500 block mb-1">
                    <Truck size={12} className="inline mr-1" />
                    Cargo (SCU)
                  </label>
                  <div className="flex gap-1 flex-wrap">
                    {SCU_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setScu(p)}
                        className={`px-2 py-1 text-xs font-mono-sc rounded border transition-colors ${
                          scu === p ? 'border-cyan-500 bg-cyan-950/50 text-cyan-400' : 'border-slate-700 text-slate-500 hover:border-slate-600'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={1}
                      value={scu}
                      onChange={(e) => setScu(Number(e.target.value) || 1)}
                      className="sci-input w-20 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-mono-sc text-slate-500 block mb-1">
                    <DollarSign size={12} className="inline mr-1" />
                    Budget (optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="No limit"
                    className="sci-input w-36 text-xs"
                  />
                </div>
              </div>

              {/* Filters row */}
              <div className="flex flex-wrap gap-3 items-end border-t border-slate-800 pt-3">
                <div>
                  <label className="text-xs font-mono-sc text-slate-500 block mb-1">
                    <Search size={12} className="inline mr-1" />
                    Commodity
                  </label>
                  <input
                    type="text"
                    value={commoditySearch}
                    onChange={(e) => setCommoditySearch(e.target.value)}
                    placeholder="Name…"
                    className="sci-input w-40 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono-sc text-slate-500 block mb-1">
                    <Filter size={12} className="inline mr-1" />
                    Buy System
                  </label>
                  <select value={buySystem} onChange={(e) => setBuySystem(e.target.value)} className="sci-select w-36 text-xs">
                    <option value="">All</option>
                    {(systems ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-mono-sc text-slate-500 block mb-1">
                    <Filter size={12} className="inline mr-1" />
                    Sell System
                  </label>
                  <select value={sellSystem} onChange={(e) => setSellSystem(e.target.value)} className="sci-select w-36 text-xs">
                    <option value="">All</option>
                    {(systems ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-mono-sc text-slate-500 block mb-1">
                    <SortDesc size={12} className="inline mr-1" />
                    Sort by
                  </label>
                  <select value={sort} onChange={(e) => setSort(e.target.value)} className="sci-select w-36 text-xs">
                    {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </ScifiPanel>

          {/* Route results */}
          {routesLoading ? (
            <LoadingGrid message="COMPUTING ROUTES…" />
          ) : routesError ? (
            <ErrorState error={routesError as Error} onRetry={() => void refetchRoutes()} />
          ) : !routes?.length ? (
            <EmptyState
              icon="📦"
              title="No routes found"
              message="Submit commodity prices to compute routes (panel on the right)"
            />
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-mono-sc text-slate-600">{routes.length} routes found for {scu} SCU</p>
              {routes.map((route: TradeRoute, i: number) => (
                <motion.div
                  key={`${route.buyCommodity}-${route.buyShop}-${route.sellShop}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.4) }}
                  className="sci-panel p-4"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <GlowBadge color="cyan">{route.buyCommodity}</GlowBadge>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="text-slate-400">
                        <MapPin size={12} className="inline mr-1 text-amber-500" />
                        {route.buyShop}
                        <span className="text-slate-600 text-xs ml-1">({route.buyLocation})</span>
                      </div>
                      <ArrowRight size={14} className="text-cyan-700" />
                      <div className="text-slate-400">
                        <MapPin size={12} className="inline mr-1 text-green-500" />
                        {route.sellShop}
                        <span className="text-slate-600 text-xs ml-1">({route.sellLocation})</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs font-mono-sc">
                    <div>
                      <span className="text-slate-600">Buy</span>
                      <p className="text-amber-400">{fmt(route.buyPrice)} aUEC</p>
                    </div>
                    <div>
                      <span className="text-slate-600">Sell</span>
                      <p className="text-green-400">{fmt(route.sellPrice)} aUEC</p>
                    </div>
                    <div>
                      <span className="text-slate-600">Investment</span>
                      <p className="text-slate-300">{fmt(route.totalInvestment)} aUEC</p>
                    </div>
                    <div>
                      <span className="text-slate-600">Profit/Unit</span>
                      <p className="text-cyan-400">{fmt(route.profitPerUnit)} aUEC</p>
                    </div>
                    <div>
                      <span className="text-slate-600">Profit/SCU</span>
                      <p className="text-cyan-400">{fmt(route.profitPerScu)} aUEC</p>
                    </div>
                    <div>
                      <span className="text-slate-600">Total Profit</span>
                      <p className="text-emerald-400 font-bold">
                        <TrendingUp size={12} className="inline mr-1" />
                        {fmt(route.totalProfit)} aUEC
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar: Price reporter */}
        <div className="xl:sticky xl:top-6 space-y-4">
          <ScifiPanel title="Report a Price" subtitle="Contribute price data">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono-sc text-slate-500 block mb-1">
                  <Package size={12} className="inline mr-1" />
                  Commodity
                </label>
                <select
                  value={reportCommodityUuid}
                  onChange={(e) => setReportCommodityUuid(e.target.value)}
                  className="sci-input w-full text-xs"
                >
                  <option value="">Select…</option>
                  {(commodities?.data ?? []).map((c: Commodity) => (
                    <option key={c.uuid} value={c.uuid}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-mono-sc text-slate-500 block mb-1">
                  <MapPin size={12} className="inline mr-1" />
                  Shop
                </label>
                <select
                  value={reportShopId}
                  onChange={(e) => setReportShopId(e.target.value)}
                  className="sci-input w-full text-xs"
                >
                  <option value="">Select…</option>
                  {commodityShops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.city ?? s.planet_moon ?? s.system ?? 'Unknown'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-mono-sc text-slate-500 block mb-1">Buy Price</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={reportBuyPrice}
                    onChange={(e) => setReportBuyPrice(e.target.value)}
                    placeholder="—"
                    className="sci-input w-full text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono-sc text-slate-500 block mb-1">Sell Price</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={reportSellPrice}
                    onChange={(e) => setReportSellPrice(e.target.value)}
                    placeholder="—"
                    className="sci-input w-full text-xs"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleReport}
                disabled={!reportCommodityUuid || !reportShopId || (!reportBuyPrice && !reportSellPrice) || reportMutation.isPending}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-mono-sc rounded border border-cyan-700 bg-cyan-950/30 text-cyan-400 hover:bg-cyan-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={12} />
                {reportMutation.isPending ? 'Submitting…' : 'Submit Price'}
              </button>

              {reportMutation.isSuccess && (
                <p className="text-xs text-green-500 font-mono-sc text-center">Price saved ✓</p>
              )}
              {reportMutation.isError && (
                <p className="text-xs text-red-500 font-mono-sc text-center">Error submitting price</p>
              )}
            </div>
          </ScifiPanel>

          <ScifiPanel title="How It Works">
            <div className="text-xs text-slate-500 space-y-2">
              <p>1. Report buy/sell prices from in-game kiosks</p>
              <p>2. Set your ship's cargo capacity (SCU)</p>
              <p>3. The calculator finds the most profitable routes</p>
              <p className="text-slate-600 italic mt-3">
                Prices are crowd-sourced — the more reports, the more reliable the routes.
              </p>
            </div>
          </ScifiPanel>
        </div>
      </div>
    </div>
  );
}
