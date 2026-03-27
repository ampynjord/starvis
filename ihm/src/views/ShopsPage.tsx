import { useQuery } from '@tanstack/react-query';
import { MapPin, ShoppingBag } from 'lucide-react';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { CanonicalMeta } from '@/components/ui/CanonicalMeta';
import type { Shop } from '@/types/api';
import { motion } from 'framer-motion';

export default function ShopsPage() {
  const { env } = useEnv();
  const { data: shops, isLoading, error, refetch } = useQuery({
    queryKey: ['shops.list', env],
    queryFn: () => api.shops.list({ env }),
  });

  if (isLoading) return <LoadingGrid message="LOADING SHOPS…" />;
  if (error)     return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!shops?.data?.length) return <EmptyState icon="🛒" title="No shops" />;

  const shopList = shops.data;

  // Group by system
  const bySystem = shopList.reduce<Record<string, Shop[]>>((acc, shop) => {
    const key = shop.system ?? 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(shop);
    return acc;
  }, {});

  return (
    <div className="max-w-screen-xl mx-auto space-y-6">
      <div>
        <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">Shops</h1>
        <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">{shopList.length} shops</p>
      </div>

      {Object.entries(bySystem).sort((a, b) => a[0].localeCompare(b[0])).map(([system, shops]) => (
        <ScifiPanel key={system} title={system} subtitle={`${shops.length} shops`} actions={<MapPin size={14} className="text-slate-600" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {shops.map((shop, i) => (
              <motion.div key={shop.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <div className="sci-panel px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <ShoppingBag size={13} className="text-cyan-700 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-300 font-rajdhani font-semibold truncate">{shop.name}</p>
                      <p className="text-xs text-slate-600 truncate">{shop.location}</p>
                      {shop.city && (
                        <p className="text-xs text-slate-700 truncate">{shop.city}</p>
                      )}
                      {shop.shop_type && (
                        <div className="mt-1">
                          <GlowBadge color="slate">{shop.display_shop_type ?? shop.shop_type}</GlowBadge>
                        </div>
                      )}
                      <CanonicalMeta
                        compact
                        className="mt-1"
                        sourceType={shop.source_type}
                        sourceName={shop.source_name}
                        confidenceScore={shop.confidence_score}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </ScifiPanel>
      ))}
    </div>
  );
}
