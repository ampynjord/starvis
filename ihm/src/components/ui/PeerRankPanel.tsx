'use client';

import { BarChart3 } from 'lucide-react';
import { ScifiPanel } from '@/components/ui/ScifiPanel';

export interface PeerValue {
  uuid: string;
  name: string;
  value: number;
}

/**
 * Situe une entité parmi ses pairs sur une statistique.
 *
 * C'est la question qu'on se pose devant une fiche — « est-elle bonne ? » — et à
 * laquelle une liste de chiffres absolus ne répond pas. Un refroidissement de 68
 * ne dit rien ; « 2ᵉ sur 11 » dit tout.
 *
 * Le panneau ne connaît ni composants ni objets : il reçoit des valeurs déjà
 * collectées. C'est ce qui lui permet de servir les deux sans qu'aucun des deux
 * n'ait à ressembler à l'autre.
 *
 * Il ne s'affiche pas quand il n'y a personne à qui se comparer : « 1er sur 1 »
 * serait une flatterie vide, et un rang sans cohorte n'informe pas.
 */
export function PeerRankPanel({
  ownUuid,
  peers,
  statLabel,
  cohortLabel,
  unit,
}: {
  ownUuid: string;
  peers: PeerValue[];
  statLabel: string;
  /** Ce qui définit la cohorte — « size 2 », « Sniper Rifle »… */
  cohortLabel: string;
  unit?: string;
}) {
  if (peers.length < 2) return null;

  const sorted = [...peers].sort((a, b) => b.value - a.value);
  const rank = sorted.findIndex((peer) => peer.uuid === ownUuid) + 1;
  // L'entité n'est pas dans sa propre cohorte : sa valeur manque ou vaut zéro.
  // Afficher un rang serait mentir sur la place qu'elle occupe.
  if (rank === 0) return null;

  const own = sorted[rank - 1].value;
  const best = sorted[0];
  const median = sorted[Math.floor(sorted.length / 2)].value;
  const share = median > 0 ? (own / median) * 100 - 100 : null;
  const topThird = rank <= Math.ceil(sorted.length / 3);

  return (
    <ScifiPanel title="Against its peers" subtitle={`${statLabel} · ${cohortLabel}`} actions={<BarChart3 size={14} className="text-cyan-700" />}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sci-panel px-4 py-3">
          <p className="text-[9px] font-mono-sc uppercase tracking-widest text-slate-600 mb-1">Rank</p>
          <p className={`text-xl font-orbitron font-black tabular-nums ${topThird ? 'text-cyan-300' : 'text-slate-300'}`}>
            {rank}
            <span className="text-sm font-normal text-slate-500"> / {sorted.length}</span>
          </p>
          <p className="text-xs font-mono-sc text-slate-600">{cohortLabel}</p>
        </div>

        <div className="sci-panel px-4 py-3">
          <p className="text-[9px] font-mono-sc uppercase tracking-widest text-slate-600 mb-1">Vs. median</p>
          {share == null ? (
            <p className="text-sm font-mono-sc text-slate-600">—</p>
          ) : (
            <p className={`text-xl font-orbitron font-black tabular-nums ${share >= 0 ? 'text-green-400' : 'text-amber-400'}`}>
              {share >= 0 ? '+' : ''}
              {share.toFixed(0)}%
            </p>
          )}
          <p className="text-xs font-mono-sc text-slate-600">{statLabel.toLowerCase()}</p>
        </div>

        <div className="sci-panel px-4 py-3">
          <p className="text-[9px] font-mono-sc uppercase tracking-widest text-slate-600 mb-1">Best of cohort</p>
          <p className="text-sm font-rajdhani font-semibold text-slate-200 truncate">{best.name}</p>
          <p className="text-xs font-mono-sc text-slate-500 tabular-nums">
            {best.value.toLocaleString('en-US')}
            {unit ? ` ${unit}` : ''}
          </p>
        </div>
      </div>
    </ScifiPanel>
  );
}

/** Lit une valeur numérique sur une ligne dont la forme n'est pas connue ici. */
export function peerValues(rows: Array<{ uuid: string; name: string }>, field: string): PeerValue[] {
  return rows
    .map((row) => {
      const raw = (row as unknown as Record<string, unknown>)[field];
      const value = raw == null ? Number.NaN : Number(raw);
      return { uuid: row.uuid, name: row.name, value };
    })
    .filter((peer) => Number.isFinite(peer.value) && peer.value > 0);
}
