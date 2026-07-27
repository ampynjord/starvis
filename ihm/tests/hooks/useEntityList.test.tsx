import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useEntityList } from '@/hooks/useEntityList';
import type { PaginatedResponse } from '@/types/api';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function page(items: string[], overrides: Partial<PaginatedResponse<string>> = {}): PaginatedResponse<string> {
  return { data: items, total: 100, page: 1, limit: 10, pages: 10, ...overrides };
}

describe('useEntityList', () => {
  it('interroge avec les paramètres communs normalisés', async () => {
    const fetcher = vi.fn().mockResolvedValue(page(['a', 'b']));
    const { result } = renderHook(() => useEntityList({ key: 'ships.list', fetcher, limit: 24 }), { wrapper });

    await waitFor(() => expect(result.current.items).toEqual(['a', 'b']));
    expect(fetcher).toHaveBeenCalledWith({ page: 1, limit: 24, search: undefined });
    expect(result.current.total).toBe(100);
    expect(result.current.totalPages).toBe(10);
  });

  it('revient à la première page quand un filtre change', async () => {
    const fetcher = vi.fn().mockResolvedValue(page(['a']));
    const { result, rerender } = renderHook(
      ({ manufacturer }: { manufacturer: string }) =>
        useEntityList({ key: 'ships.list', filters: { manufacturer }, fetcher, limit: 24 }),
      { wrapper, initialProps: { manufacturer: '' } },
    );

    await waitFor(() => expect(result.current.items).toEqual(['a']));
    act(() => result.current.setPage(4));
    await waitFor(() => expect(result.current.page).toBe(4));

    // Filtrer depuis la page 4 afficherait une page vide : le retour à la
    // première page doit être automatique, sans que la page l'orchestre.
    rerender({ manufacturer: 'AEGS' });
    await waitFor(() => expect(result.current.page).toBe(1));
    expect(fetcher).toHaveBeenLastCalledWith({ page: 1, limit: 24, search: undefined });
  });

  it('ne relance pas la requête quand les filtres sont recréés à l’identique', async () => {
    const fetcher = vi.fn().mockResolvedValue(page(['a']));
    const { result, rerender } = renderHook(
      () => useEntityList({ key: 'ships.list', filters: { role: 'Fighter' }, fetcher, limit: 24 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.items).toEqual(['a']));
    const callsAfterFirstLoad = fetcher.mock.calls.length;
    rerender();
    rerender();
    expect(fetcher.mock.calls.length).toBe(callsAfterFirstLoad);
  });

  it("n'amorce avec la donnée serveur que si l'état courant correspond", async () => {
    const seed = page(['serveur']);
    const fetcher = vi.fn().mockResolvedValue(page(['réseau']));

    const matched = renderHook(
      () => useEntityList({ key: 'k1', fetcher, limit: 24, initialData: seed, initialDataMatches: true }),
      { wrapper },
    );
    expect(matched.result.current.items).toEqual(['serveur']);

    const unmatched = renderHook(
      () => useEntityList({ key: 'k2', fetcher, limit: 24, initialData: seed, initialDataMatches: false }),
      { wrapper },
    );
    expect(unmatched.result.current.items).toEqual([]);
    await waitFor(() => expect(unmatched.result.current.items).toEqual(['réseau']));
  });

  it('remet la pagination à zéro lors d’une recherche', async () => {
    const fetcher = vi.fn().mockResolvedValue(page(['a']));
    const { result } = renderHook(() => useEntityList({ key: 'ships.list', fetcher, limit: 24 }), { wrapper });

    await waitFor(() => expect(result.current.items).toEqual(['a']));
    act(() => result.current.setPage(3));
    await waitFor(() => expect(result.current.page).toBe(3));

    act(() => result.current.updateSearch('avenger'));
    expect(result.current.search).toBe('avenger');
    await waitFor(() => expect(result.current.page).toBe(1));
  });
});
