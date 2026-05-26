import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import CommoditiesPage from '@/views/CommoditiesPage';

vi.mock('@/services/api', () => ({
  api: {
    commodities: {
      categories: vi.fn().mockResolvedValue([{ label: 'All', types: [], count: 1 }, { label: 'Raw Ore / Minerals', types: ['RawMaterial'], count: 1 }]),
      list: vi.fn().mockResolvedValue({
        data: [{ uuid: 'comm1', name: 'Laranite', type: 'RawMaterial' }],
        total: 1,
        page: 1,
        limit: 20,
        pages: 1,
      }),
    },
  },
}));

describe('CommoditiesPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the page heading (Industrial or Trade Goods)', async () => {
    renderWithProviders(<CommoditiesPage />);
    await waitFor(() => {
      const heading = screen.queryByRole('heading', { name: /industrial|trade goods/i });
      expect(heading).toBeInTheDocument();
    });
  });

  it('renders commodity name from API', async () => {
    renderWithProviders(<CommoditiesPage />);
    await waitFor(() => expect(screen.getByText('Laranite')).toBeInTheDocument());
  });
});
