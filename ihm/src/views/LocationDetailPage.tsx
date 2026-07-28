'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, Radar, Store } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageShell } from '@/components/ui/PageShell';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { useEnv } from '@/contexts/EnvContext';
import { api } from '@/services/api';

interface ChildLocation {
  uuid: string;
  name: string | null;
  type: string | null;
}

interface LocationShop {
  id: number;
  name: string | null;
  shop_type: string | null;
  inventory_count?: number | null;
}

/**
 * La fiche d'un lieu.
 *
 * L'API servait déjà le détail, ses lieux contenus et ses boutiques ; rien ne les
 * affichait. La liste des lieux se parcourt, elle ne se descend pas — or un lieu
 * est d'abord un point dans une hiérarchie, et ce qu'on veut savoir en le
 * regardant, c'est ce qu'il contient et ce qu'on peut y acheter.
 *
 * Les sections vides ne sont pas rendues : un bunker sans boutique ne gagne rien
 * à afficher un panneau « 0 boutique ».
 */
export default function LocationDetailPage() {
  const params = useParams<{ uuid: string }>();
  const uuid = params?.uuid;
  const router = useRouter();
  const { env } = useEnv();

  const {
    data: location,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['locations.get', uuid, env],
    queryFn: () => api.locations.get(uuid!, env),
    enabled: !!uuid,
  });

  const { data: children } = useQuery({
    queryKey: ['locations.children', uuid, env],
    queryFn: () => api.locations.children(uuid!, env),
    enabled: !!uuid,
  });

  const { data: shops } = useQuery({
    queryKey: ['locations.shops', uuid, env],
    queryFn: () => api.locations.shops(uuid!, env),
    enabled: !!uuid,
  });

  if (isLoading) return <LoadingGrid message="LOADING LOCATION…" />;
  if (error) return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!location) return null;

  const contained = (children ?? []) as unknown as ChildLocation[];
  const terminals = (shops ?? []) as unknown as LocationShop[];
  const description = (location as unknown as { description?: string | null }).description;

  return (
    <PageShell size="xl">
      <div className="flex items-center gap-2 text-xs font-mono-sc text-slate-600">
        <button type="button" onClick={() => router.back()} className="hover:text-slate-400 transition-colors flex items-center gap-1">
          <ArrowLeft size={12} /> Back
        </button>
        <ChevronRight size={10} />
        <Link href="/locations" className="hover:text-slate-400">
          Locations
        </Link>
        <ChevronRight size={10} />
        <span className="text-slate-400">{location.name}</span>
      </div>

      <div className="sci-panel px-6 py-5">
        <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-widest mb-1">{location.type ?? 'Location'}</p>
        <h1 className="font-orbitron text-3xl font-black text-slate-100 leading-tight">{location.name}</h1>
        <div className="flex flex-wrap gap-2 mt-3">
          {location.system_code && <GlowBadge color="slate">{location.system_code}</GlowBadge>}
          {location.affiliation && <GlowBadge color="cyan">{location.affiliation}</GlowBadge>}
          {location.is_scannable && <GlowBadge color="slate">Scannable</GlowBadge>}
          {location.parent_uuid && (
            <Link href={`/locations/${location.parent_uuid}`}>
              <GlowBadge color="slate">↑ Parent location</GlowBadge>
            </Link>
          )}
        </div>
        {description && <p className="mt-4 text-sm text-slate-400 leading-relaxed max-w-3xl">{description}</p>}
      </div>

      {contained.length > 0 && (
        <ScifiPanel
          title="Contains"
          subtitle={`${contained.length} location${contained.length !== 1 ? 's' : ''}`}
          actions={<Radar size={14} className="text-cyan-700" />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {contained.map((child) => (
              <Link
                key={child.uuid}
                href={`/locations/${child.uuid}`}
                className="sci-panel px-3 py-2 hover:border-cyan-800 transition-colors"
              >
                <p className="text-sm font-rajdhani font-semibold text-slate-200 truncate">{child.name ?? '—'}</p>
                <p className="text-[10px] font-mono-sc uppercase tracking-widest text-slate-600">{child.type ?? '—'}</p>
              </Link>
            ))}
          </div>
        </ScifiPanel>
      )}

      {terminals.length > 0 && (
        <ScifiPanel
          title="Shops"
          subtitle={`${terminals.length} terminal${terminals.length !== 1 ? 's' : ''}`}
          actions={<Store size={14} className="text-amber-700" />}
        >
          <div className="space-y-1">
            {terminals.map((shop) => (
              <div key={shop.id} className="sci-panel px-3 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-rajdhani font-semibold text-slate-300 truncate">{shop.name ?? '—'}</p>
                  <p className="text-[10px] font-mono-sc uppercase tracking-widest text-slate-600">{shop.shop_type ?? '—'}</p>
                </div>
                {shop.inventory_count != null && (
                  <span className="font-mono-sc text-xs text-slate-500 tabular-nums shrink-0">{shop.inventory_count} items</span>
                )}
              </div>
            ))}
          </div>
        </ScifiPanel>
      )}
    </PageShell>
  );
}
