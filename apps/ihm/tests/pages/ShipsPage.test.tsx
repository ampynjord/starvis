import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import ShipsPage from '@/views/ShipsPage';
import { api } from '@/services/api';

vi.mock('@/services/api', () => ({
  api: {
    ships: {
      filters: vi.fn().mockResolvedValue({
        manufacturers: [],
        roles: [],
        careers: [],
        variant_types: [],
        sizes: [],
        vehicle_categories: [],
      }),
      list: vi.fn().mockResolvedValue({
        data: [{ uuid: 's1', name: 'Aurora MR', manufacturer_code: 'RSI', role: 'Multi-Role', size: 1 }],
        total: 1,
        page: 1,
        limit: 20,
        pages: 1,
      }),
    },
  },
}));

describe('ShipsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the Ships tab', async () => {
    renderWithProviders(<ShipsPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^ships$/i })).toBeInTheDocument());
  });

  it('renders ship count from API response', async () => {
    renderWithProviders(<ShipsPage />);
    await waitFor(() => expect(screen.getByText(/1 results/i)).toBeInTheDocument());
  });

  it('renders the ship name from API', async () => {
    renderWithProviders(<ShipsPage />);
    await waitFor(() => expect(screen.getByText('Aurora MR')).toBeInTheDocument());
  });

  it('shows loading state initially', () => {
    vi.mocked(api.ships.list).mockReturnValueOnce(new Promise(() => {}));
    renderWithProviders(<ShipsPage />);
    expect(screen.getByText(/loading ships/i)).toBeInTheDocument();
  });
});
