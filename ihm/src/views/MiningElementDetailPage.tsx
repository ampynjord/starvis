'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, Gauge, Layers, Package, Zap } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageShell } from '@/components/ui/PageShell';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { useEnv } from '@/contexts/EnvContext';
import { api } from '@/services/api';

interface Deposit {
  composition_uuid: string;
  deposit_name: string | null;
  class_name: string | null;
  min_percentage: number | null;
  max_percentage: number | null;
  probability: number | null;
}

const pct = (value: number | null | undefined, digits = 1): string =>
  value == null || Number.isNaN(Number(value)) ? '—' : `${Number(value).toFixed(digits)}%`;

const num = (value: number | null | undefined, digits = 2): string =>
  value == null || Number.isNaN(Number(value)) ? '—' : Number(value).toFixed(digits);

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="sci-panel px-4 py-3">
      <p className="flex items-center gap-1 text-[9px] font-mono-sc uppercase tracking-widest text-slate-600 mb-1">
        {icon}
        {label}
      </p>
      <p className="text-lg font-orbitron font-black text-slate-200 tabular-nums">{value}</p>
      {hint && <p className="text-[10px] font-mono-sc text-slate-600">{hint}</p>}
    </div>
  );
}

/**
 * La fiche d'un minerai.
 *
 * L'API servait déjà ce détail — gisements, parts, probabilités — sans qu'aucune
 * page ne le consomme. Le tableau de la page minage montre les éléments côte à
 * côte ; il ne dit pas où l'on trouve celui qu'on regarde, ni en quelle
 * proportion.
 *
 * Les gisements sont classés par probabilité décroissante : c'est l'ordre dans
 * lequel on les rencontre, donc celui qui répond à « où le chercher ».
 */
export default function MiningElementDetailPage() {
  const params = useParams<{ uuid: string }>();
  const uuid = params?.uuid;
  const router = useRouter();
  const { env } = useEnv();

  const {
    data: element,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['mining.element', uuid, env],
    queryFn: () => api.mining.element(uuid!, env),
    enabled: !!uuid,
  });

  if (isLoading) return <LoadingGrid message="LOADING MINERAL…" />;
  if (error) return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!element) return null;

  const deposits = ((element as unknown as { found_in?: Deposit[] }).found_in ?? [])
    .slice()
    .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));

  // La fenêtre optimale est donnée par son centre et son étroitesse : c'est
  // l'intervalle de puissance où le tir fracture sans faire exploser. Le calcul
  // est fait ici parce que la fiche est l'endroit où l'on s'en sert.
  const midpoint = element.optimal_window_midpoint;
  const thinness = element.optimal_window_thinness;
  const halfWidth = midpoint != null && thinness ? 0.5 / thinness : null;
  const window =
    midpoint != null && halfWidth != null
      ? `${((midpoint - halfWidth) * 100).toFixed(0)}–${((midpoint + halfWidth) * 100).toFixed(0)}%`
      : '—';

  return (
    <PageShell size="xl">
      <div className="flex items-center gap-2 text-xs font-mono-sc text-slate-600">
        <button type="button" onClick={() => router.back()} className="hover:text-slate-400 transition-colors flex items-center gap-1">
          <ArrowLeft size={12} /> Back
        </button>
        <ChevronRight size={10} />
        <Link href="/mining" className="hover:text-slate-400">
          Mining
        </Link>
        <ChevronRight size={10} />
        <span className="text-slate-400">{element.name}</span>
      </div>

      <div className="sci-panel px-6 py-5">
        <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-widest mb-1">Mineable element</p>
        <h1 className="font-orbitron text-3xl font-black text-slate-100 leading-tight">{element.name}</h1>
        <div className="flex flex-wrap gap-2 mt-3">
          <GlowBadge color="slate">{deposits.length} deposit{deposits.length !== 1 ? 's' : ''}</GlowBadge>
          {element.commodity_uuid && (
            <Link href={`/commodities/${element.commodity_uuid}`}>
              <GlowBadge color="cyan">Trade prices →</GlowBadge>
            </Link>
          )}
        </div>
      </div>

      <ScifiPanel title="Mining behaviour" subtitle="What the laser has to overcome">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={<Zap size={9} />} label="Instability" value={num(element.instability, 0)} hint="higher shatters sooner" />
          <Stat icon={<Gauge size={9} />} label="Resistance" value={num(element.resistance)} hint="power needed to fracture" />
          <Stat icon={<Package size={9} />} label="Optimal window" value={window} hint="charge range that fractures" />
          <Stat icon={<Layers size={9} />} label="Cluster factor" value={num(element.cluster_factor)} hint="how much it groups" />
        </div>
      </ScifiPanel>

      {deposits.length > 0 && (
        <ScifiPanel title="Where to find it" subtitle={`${deposits.length} deposit types, most likely first`}>
          <div className="space-y-1 max-h-[32rem] overflow-y-auto">
            {deposits.map((deposit) => (
              <div key={deposit.composition_uuid} className="sci-panel px-3 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-rajdhani font-semibold text-slate-300 truncate">
                    {deposit.deposit_name || deposit.class_name || '—'}
                  </p>
                  <p className="text-xs text-slate-600">
                    {deposit.min_percentage != null && deposit.max_percentage != null
                      ? `${deposit.min_percentage}–${deposit.max_percentage}% of the rock`
                      : '—'}
                  </p>
                </div>
                <span className="font-mono-sc text-xs text-cyan-300 tabular-nums shrink-0">
                  {pct(deposit.probability != null ? deposit.probability * 100 : null, 0)}
                </span>
              </div>
            ))}
          </div>
        </ScifiPanel>
      )}
    </PageShell>
  );
}
