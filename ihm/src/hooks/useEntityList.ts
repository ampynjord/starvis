'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import type { PaginatedResponse } from '@/types/api';
import { useDebounce } from './useDebounce';

export interface EntityListParams {
  page: number;
  limit: number;
  /** Terme de recherche débattu, `undefined` si vide. */
  search: string | undefined;
}

export interface UseEntityListOptions<T, R extends PaginatedResponse<T> = PaginatedResponse<T>> {
  /** Préfixe de clé de cache, par exemple `ships.list`. */
  key: string;
  /**
   * Filtres propres à la page. Ils entrent dans la clé de cache, et tout
   * changement ramène à la première page — sans quoi filtrer depuis la page 4
   * afficherait une page vide.
   */
  filters?: Record<string, unknown>;
  /** Appel API, recevant les paramètres communs déjà normalisés. */
  fetcher: (params: EntityListParams) => Promise<R>;
  limit: number;
  /** Première page fournie par le rendu serveur, s'il y en a une. */
  initialData?: R | null;
  /**
   * N'amorcer que si l'état courant correspond à ce que le serveur a chargé.
   * Amorcer un état différent servirait silencieusement le mauvais contenu.
   */
  initialDataMatches?: boolean;
  /** Recherche de départ, pour les pages dont l'URL porte un terme (`?search=`). */
  initialSearch?: string;
  /** Retarde la requête tant qu'une dépendance n'est pas prête (taxonomie, etc.). */
  enabled?: boolean;
  searchDelay?: number;
}

export interface UseEntityListResult<T, R extends PaginatedResponse<T> = PaginatedResponse<T>> {
  data: R | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
  items: T[];
  total: number | undefined;
  page: number;
  totalPages: number | undefined;
  search: string;
  /** Recherche débattue — à utiliser pour les requêtes annexes de la page. */
  debouncedSearch: string;
  setPage: (page: number) => void;
  updateSearch: (value: string) => void;
  /** Change de page et remonte en haut de liste. */
  goToPage: (page: number) => void;
  /** Vide la recherche et revient à la première page. */
  resetListState: () => void;
}

/**
 * Mécanique commune aux pages de liste : état de pagination et de recherche,
 * composition de la clé de cache, amorçage depuis le rendu serveur.
 *
 * Chaque page conserve ses propres filtres et son propre rendu de cartes ; seule
 * la boucle qui était réécrite à l'identique d'une page à l'autre est ici.
 */
export function useEntityList<T, R extends PaginatedResponse<T> = PaginatedResponse<T>>({
  key,
  filters = {},
  fetcher,
  limit,
  initialData,
  initialDataMatches = false,
  initialSearch = '',
  enabled = true,
  searchDelay = 350,
}: UseEntityListOptions<T, R>): UseEntityListResult<T, R> {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(initialSearch);
  const debouncedSearch = useDebounce(search, searchDelay);

  // Retour à la première page quand les filtres changent. Fait pendant le rendu
  // plutôt que dans un effet : la requête part directement avec la bonne page,
  // au lieu d'en déclencher une inutile sur l'ancienne.
  const filtersKey = JSON.stringify(filters);
  const [seenFiltersKey, setSeenFiltersKey] = useState(filtersKey);
  if (filtersKey !== seenFiltersKey) {
    setSeenFiltersKey(filtersKey);
    setPage(1);
  }
  const currentPage = filtersKey !== seenFiltersKey ? 1 : page;

  const query = useQuery({
    queryKey: [key, currentPage, debouncedSearch, filtersKey],
    queryFn: () => fetcher({ page: currentPage, limit, search: debouncedSearch || undefined }),
    initialData: initialDataMatches ? (initialData ?? undefined) : undefined,
    enabled,
  });

  const updateSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const goToPage = useCallback((next: number) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const resetListState = useCallback(() => {
    setSearch('');
    setPage(1);
  }, []);

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    items: query.data?.data ?? [],
    total: query.data?.total,
    page: query.data?.page ?? currentPage,
    totalPages: query.data?.pages,
    search,
    debouncedSearch,
    setPage,
    updateSearch,
    goToPage,
    resetListState,
  };
}
