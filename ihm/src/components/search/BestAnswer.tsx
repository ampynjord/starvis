'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Trophy } from 'lucide-react';
import Link from 'next/link';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import type { Intent } from '@/lib/intent';
import { api } from '@/services/api';

/**
 * Ce qu'un joueur dit, et le type que porte la base.
 *
 * Personne ne cherche « QuantumDrive » : on écrit « quantum drive », « qd », ou
 * « quantum ». Cette table est le pont, et elle est volontairement courte —
 * chaque entrée est une famille dont on a vérifié qu'elle porte bien sa
 * statistique déterminante.
 *
 * Refroidisseurs et centrales en sont absents : leurs statistiques ne sont
 * renseignées pour aucun des 76 et 98 composants concernés. Les classer
 * produirait un palmarès de valeurs nulles.
 */
const SPOKEN_TYPE: Array<{ words: RegExp; type: string; field: string; label: string; unit?: string }> = [
  { words: /^shields?$/i, type: 'Shield', field: 'shield_hp', label: 'Shield HP' },
  { words: /^(?:quantum(?:\s*drives?)?|qd|drives?)$/i, type: 'QuantumDrive', field: 'qd_speed', label: 'Quantum speed' },
  { words: /^(?:thrusters?|engines?)$/i, type: 'Thruster', field: 'thruster_max_thrust', label: 'Max thrust' },
  { words: /^radars?$/i, type: 'Radar', field: 'radar_range', label: 'Radar range' },
  { words: /^(?:fuel\s*tanks?|tanks?)$/i, type: 'FuelTank', field: 'fuel_capacity', label: 'Capacity', unit: 'L' },
  { words: /^(?:weapons?|guns?|cannons?)$/i, type: 'WeaponGun', field: 'weapon_dps', label: 'DPS' },
  { words: /^missiles?$/i, type: 'Missile', field: 'missile_damage', label: 'Damage' },
];

const numeric = (value: unknown): number => {
  const n = value == null ? Number.NaN : Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
};

/**
 * Répond à « quel est le meilleur … ».
 *
 * Sans taille précisée, le classement porte sur toute la famille — et le plus
 * gros gagne, ce qui n'apprend pas grand-chose. Le panneau le dit alors
 * explicitement plutôt que de laisser croire à un palmarès à armes égales.
 *
 * Il ne s'affiche pas si le mot saisi ne désigne aucune famille connue : la
 * recherche ordinaire reprend la main.
 */
export function BestAnswer({ intent, env }: { intent: Intent; env?: string }) {
  const match = SPOKEN_TYPE.find((entry) => entry.words.test(intent.subject));

  const { data: rows } = useQuery({
    queryKey: ['intent.best', match?.type, intent.size, env],
    queryFn: () =>
      api.components.list({
        type: match!.type,
        ...(intent.size != null ? { size: intent.size } : {}),
        limit: 200,
        env,
      }),
    enabled: Boolean(match),
  });

  if (!match) return null;

  const ranked = (rows?.data ?? [])
    .map((row) => ({ uuid: row.uuid, name: row.name, size: row.size, value: numeric((row as unknown as Record<string, unknown>)[match.field]) }))
    .filter((row) => Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  if (!ranked.length) return null;

  return (
    <ScifiPanel
      title={`Best ${match.type.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}`}
      subtitle={intent.size != null ? `${match.label} · size ${intent.size}` : `${match.label} · all sizes`}
      actions={<Trophy size={14} className="text-amber-600" />}
    >
      {intent.size == null && (
        <p className="mb-3 text-xs font-mono-sc text-slate-600">
          No size given — the largest wins by construction. Add « size 2 » to compare like for like.
        </p>
      )}

      <ol className="space-y-1">
        {ranked.map((row, index) => (
          <li key={row.uuid}>
            <Link href={`/components/${row.uuid}`} className="sci-panel flex items-center gap-3 px-3 py-2 hover:border-cyan-800 transition-colors">
              <span className={`font-orbitron text-sm font-black tabular-nums w-5 ${index === 0 ? 'text-amber-400' : 'text-slate-600'}`}>
                {index + 1}
              </span>
              <span className="flex-1 min-w-0 text-sm font-rajdhani font-semibold text-slate-200 truncate">{row.name}</span>
              {row.size != null && <span className="text-[10px] font-mono-sc text-slate-600 shrink-0">S{row.size}</span>}
              <span className="font-mono-sc text-xs text-cyan-300 tabular-nums shrink-0">
                {row.value.toLocaleString('en-US')}
                {match.unit ? ` ${match.unit}` : ''}
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <Link
        href={`/components?type=${match.type}${intent.size != null ? `&size=${intent.size}` : ''}`}
        className="mt-3 inline-flex items-center gap-1 text-xs font-mono-sc text-cyan-500 hover:text-cyan-300 transition-colors"
      >
        Browse all <ArrowRight size={11} />
      </Link>
    </ScifiPanel>
  );
}
