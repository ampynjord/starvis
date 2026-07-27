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

export interface UseEntityListOptions<T> {
  /** Préfixe de clé de cache, par exemple `ships.list`. */
  key: string;
  /**
   * Filtres propres à la page. Ils entrent dans la clé de cache, et tout
   * changement ramène à la première page — sans quoi filtrer depuis la page 4
   * afficherait une page vide.
   */
  filters?: Record<string, unknown>;
  /** Appel API, recevant les paramètres communs déjà normalisés. */
  fetcher: (params: EntityListParams) => Promise<PaginatedResponse<T>>;
  limit: number;
  /** Première page fournie par le rendu serveur, s'il y en a une. */
  initialData?: PaginatedResponse<T> | null;
  /**
   * N'amorcer que si l'état courant correspond à ce que le serveur a chargé.
   * Amorcer un état différent servirait silencieusement le mauvais contenu.
   */
  initialDataMatches?: boolean;
  searchDelay?: number;
}

export interface UseEntityListResult<T> {
  data: PaginatedResponse<T> | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
  items: T[];
  total: number | undefined;
  page: number;
  totalPages: number | undefined;
  search: string;
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
export function useEntityList<T>({
  key,
  filters = {},
  fetcher,
  limit,
  initialData,
  initialDataMatches = false,
  searchDelay = 350,
}: UseEntityListOptions<T>): UseEntityListResult<T> {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
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
    setPage,
    updateSearch,
    goToPage,
    resetListState,
  };
}
