import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import RankingPage from '@/views/RankingPage';

vi.mock('@/services/api', () => ({
  api: {
    ships: {
      ranking: vi.fn().mockResolvedValue({
        ships: [
          { uuid: 's1', name: 'Hornet F7C', manufacturer_code: 'ANVL', scm_speed: 215 },
          { uuid: 's2', name: 'Aurora MR', manufacturer_code: 'RSI', scm_speed: 190 },
        ],
        total: 2,
        sort: 'scm_speed',
        order: 'desc',
        category: 'ship',
        statCategory: 'Flight',
        top: 50,
        stats: [{ key: 'scm_speed', label: 'SCM Speed', unit: 'm/s', higher_is_better: true, category: 'Flight' }],
        statCategories: ['All', 'Flight'],
        vehicleCategories: [{ label: 'Ships', value: 'ship' }],
        topOptions: [{ label: 'Top 50', value: 50 }],
        maxByKey: { scm_speed: 215 },
        chartData: [
          { uuid: 's1', name: 'Hornet F7C', value: 215 },
          { uuid: 's2', name: 'Aurora MR', value: 190 },
        ],
      }),
      filters: vi.fn().mockResolvedValue({ manufacturers: [] }),
    },
  },
}));

describe('RankingPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the Ranking heading', async () => {
    renderWithProviders(<RankingPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /ranking/i })).toBeInTheDocument());
  });

  it('renders ship names from API', async () => {
    renderWithProviders(<RankingPage />);
    await waitFor(() => {
      expect(screen.getByText('Hornet F7C')).toBeInTheDocument();
      expect(screen.getByText('Aurora MR')).toBeInTheDocument();
    });
  });
});
