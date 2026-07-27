'use client';

import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';

export type SortDirection = 'asc' | 'desc';

export interface SortableThProps<K extends string> {
  label: string;
  /** Clé portée par cette colonne. Générique : chaque tableau a son propre jeu. */
  sortKey: K;
  /** Clé actuellement triée. */
  current: K;
  dir: SortDirection;
  onSort: (key: K) => void;
  /** Aligne à gauche plutôt qu'au centre — typiquement la colonne d'intitulé. */
  left?: boolean;
  /** Classes additionnelles, pour les tableaux dont l'entête a sa propre échelle. */
  className?: string;
  /** Couleur au repos, quand la colonne n'est pas celle qui trie. */
  inactiveClassName?: string;
  iconSize?: number;
}

/**
 * En-tête de colonne triable : intitulé, indicateur de sens, bascule au clic.
 *
 * Existait en deux copies (tableau des minerais et tableau des minerais bruts)
 * dont les types de clé étaient figés chacun de leur côté, ce qui empêchait de
 * les partager. Le paramètre générique lève cette contrainte.
 */
export function SortableTh<K extends string>({
  label,
  sortKey,
  current,
  dir,
  onSort,
  left,
  className = '',
  inactiveClassName = '',
  iconSize = 10,
}: SortableThProps<K>) {
  const active = current === sortKey;
  const Icon = active ? (dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;

  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`p-2 cursor-pointer select-none transition-colors hover:text-slate-300 ${left ? 'text-left' : 'text-center'} ${active ? 'text-cyan-500' : inactiveClassName} ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon size={iconSize} />
      </span>
    </th>
  );
}
