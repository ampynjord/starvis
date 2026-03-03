import { useQuery } from '@tanstack/react-query';
import { MapPin, ShoppingBag } from 'lucide-react';
import { api } from '@/services/api';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { GlowBadge } from '@/components/ui/GlowBadge';
import type { Shop } from '@/types/api';
import { motion } from 'framer-motion';

export default function ShopsPage() {
  const { data: shops, isLoading, error, refetch } = useQuery({
    queryKey: ['shops.list'],
    queryFn: () => api.shops.list(),
  });

  if (isLoading) return <LoadingGrid message="CHARGEMENT DES BOUTIQUES…" />;
  if (error)     return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!shops?.length) return <EmptyState icon="🛒" title="Aucune boutique" />;

  // Group by system
  const bySystem = shops.reduce<Record<string, Shop[]>>((acc, shop) => {
    const key = shop.system ?? 'Inconnu';
    if (!acc[key]) acc[key] = [];
    acc[key].push(shop);
    return acc;
  }, {});

  return (
    <div className="max-w-screen-xl mx-auto space-y-6">
      <div>
        <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">Boutiques</h1>
        <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">{shops.length} boutiques</p>
      </div>

      {Object.entries(bySystem).sort((a, b) => a[0].localeCompare(b[0])).map(([system, shops]) => (
        <ScifiPanel key={system} title={system} subtitle={`${shops.length} boutiques`} actions={<MapPin size={14} className="text-slate-600" />}>
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
                      {shop.type && (
                        <div className="mt-1">
                          <GlowBadge color="slate">{shop.type}</GlowBadge>
                        </div>
                      )}
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
