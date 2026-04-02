import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import ShopsPage from '@/views/ShopsPage';

vi.mock('@/services/api', () => ({
  api: {
    shops: {
      list: vi.fn().mockResolvedValue({
        data: [{ id: 1, name: 'Dumpers Depot', shop_type: 'General', system: 'Stanton', location: 'New Babbage' }],
        total: 1,
        page: 1,
        limit: 20,
        pages: 1,
      }),
    },
  },
}));

describe('ShopsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the Shops heading', async () => {
    renderWithProviders(<ShopsPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /shops/i })).toBeInTheDocument());
  });

  it('renders shop name from API', async () => {
    renderWithProviders(<ShopsPage />);
    await waitFor(() => expect(screen.getByText('Dumpers Depot')).toBeInTheDocument());
  });
});
