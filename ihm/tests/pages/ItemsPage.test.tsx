import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import ItemsPage from '@/views/ItemsPage';

vi.mock('@/services/api', () => ({
  api: {
    items: {
      navigation: vi.fn().mockResolvedValue({
        fpsCategories: [{ slug: 'all', label: 'All', count: 1 }],
        otherCategories: [{ slug: 'all', label: 'All', count: 1 }],
        fpsSubTypeOptions: {},
        consumableFilterOptions: {},
      }),
      manufacturers: vi.fn().mockResolvedValue({ manufacturers: [] }),
      list: vi.fn().mockResolvedValue({
        data: [{ uuid: 'i1', name: 'P4-AR', type: 'FPS Weapon', sub_type: 'Rifle' }],
        total: 1,
        page: 1,
        limit: 20,
        pages: 1,
      }),
    },
  },
}));

describe('ItemsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the page heading (Items or FPS Gear)', async () => {
    renderWithProviders(<ItemsPage />);
    await waitFor(() => {
      const heading = screen.queryByRole('heading', { name: /equipment|armor|clothing|weapons|utility|ammo|sustenance/i });
      expect(heading).toBeInTheDocument();
    });
  });

  it('renders item name from API', async () => {
    renderWithProviders(<ItemsPage />);
    await waitFor(() => expect(screen.getByText('P4-AR')).toBeInTheDocument());
  });
});
