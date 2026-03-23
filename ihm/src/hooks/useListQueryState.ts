import { useCallback, useState } from 'react';
import { useDebounce } from './useDebounce';

interface ListQueryState {
  page: number;
  search: string;
  debouncedSearch: string;
  setPage: (page: number) => void;
  setSearch: (value: string) => void;
  updateSearch: (value: string) => void;
  updatePageWithScroll: (page: number) => void;
  resetListState: () => void;
}

export function useListQueryState(searchDelay = 350): ListQueryState {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, searchDelay);

  const updateSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const updatePageWithScroll = useCallback((nextPage: number) => {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const resetListState = useCallback(() => {
    setSearch('');
    setPage(1);
  }, []);

  return {
    page,
    search,
    debouncedSearch,
    setPage,
    setSearch,
    updateSearch,
    updatePageWithScroll,
    resetListState,
  };
}
