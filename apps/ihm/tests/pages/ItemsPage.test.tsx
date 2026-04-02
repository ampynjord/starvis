import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import ItemsPage from '@/views/ItemsPage';

vi.mock('@/services/api', () => ({
  api: {
    items: {
      filters: vi.fn().mockResolvedValue({ types: ['FPS Weapon', 'Armor'], sub_types: [], manufacturers: [] }),
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

  it('renders the page heading (Other Items or FPS Gear)', async () => {
    renderWithProviders(<ItemsPage />);
    await waitFor(() => {
      const heading = screen.queryByRole('heading', { name: /other items|fps gear/i });
      expect(heading).toBeInTheDocument();
    });
  });

  it('renders item name from API', async () => {
    renderWithProviders(<ItemsPage />);
    await waitFor(() => expect(screen.getByText('P4-AR')).toBeInTheDocument());
  });
});
