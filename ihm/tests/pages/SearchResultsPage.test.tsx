import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import SearchResultsPage from '@/views/SearchResultsPage';

vi.mock('@/services/api', () => ({
  api: {
    search: vi.fn().mockResolvedValue({
      ships: [{ uuid: 's1', name: 'Aurora MR' }],
      components: [],
      items: [],
      commodities: [],
      missions: [],
      recipes: [],
    }),
  },
}));

describe('SearchResultsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the Search heading', async () => {
    renderWithProviders(<SearchResultsPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /search/i })).toBeInTheDocument());
  });
});
