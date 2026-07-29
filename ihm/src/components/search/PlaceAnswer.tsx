'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import type { Intent } from '@/lib/intent';
import { api } from '@/services/api';

/**
 * Répond « qu'est-ce qu'il y a là-bas » quand la recherche le demandait.
 *
 * La question précède l'arrivée : on veut savoir si la station a un hangar large
 * et de quoi acheter une armure avant de s'y rendre, pas après. Les commodités
 * d'un lieu n'ont été extraites que le 29 juillet 2026 ; la question était sans
 * réponse jusque-là.
 *
 * ── Ce qu'il refuse de faire ─────────────────────────────────────────────────
 *
 * Répondre pour un lieu approchant. Si le nom cherché ne désigne pas un lieu, ou
 * si ce lieu ne déclare aucun service, le panneau ne s'affiche pas : la
 * recherche ordinaire reprend la main. Sur 1 120 lieux, 92 seulement portent des
 * commodités — le silence est la réponse la plus fréquente, et il est juste.
 */
export function PlaceAnswer({ intent, env }: { intent: Intent; env?: string }) {
  const { data: matches } = useQuery({
    queryKey: ['intent.location', intent.subject, env],
    queryFn: () => api.locations.list({ search: intent.subject, limit: 5, env }),
  });

  // Le nom exact d'abord : « Lorville » ne doit pas répondre pour « Lorville
  // Hospital » quand les deux existent.
  const wanted = intent.subject.toLowerCase();
  const location = (matches?.data ?? []).find((l) => l.name?.toLowerCase() === wanted) ?? matches?.data?.[0];

  const { data: detail } = useQuery({
    queryKey: ['locations.get', location?.uuid, env],
    queryFn: () => api.locations.get(location!.uuid, env),
    enabled: Boolean(location?.uuid),
  });

  const amenities = detail?.amenities ?? [];
  if (!location || amenities.length === 0) return null;

  return (
    <ScifiPanel
      title={`On site at ${location.name}`}
      subtitle={`${amenities.length} service${amenities.length !== 1 ? 's' : ''}`}
      actions={<CheckCircle2 size={14} className="text-emerald-700" />}
    >
      <div className="flex flex-wrap gap-2">
        {amenities.map((amenity) => (
          <span key={amenity.id} className="sci-panel px-2.5 py-1 text-xs font-rajdhani text-slate-300">
            {amenity.display_name || amenity.name}
          </span>
        ))}
      </div>
      <Link
        href={`/locations/${location.uuid}`}
        className="mt-3 inline-flex items-center gap-1 text-xs font-mono-sc text-cyan-700 hover:text-cyan-400"
      >
        Full record <ArrowRight size={12} />
      </Link>
    </ScifiPanel>
  );
}
