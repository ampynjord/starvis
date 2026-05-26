import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import PaintsPage from '@/views/PaintsPage';

vi.mock('@/services/api', () => ({
  api: {
    paints: {
      groups: vi.fn().mockResolvedValue({
        groups: [
          {
            manufacturerName: 'RSI',
            paintCount: 1,
            shipCount: 1,
            ships: [
              {
                shipName: 'Aurora MR',
                shipUuid: 's1',
                paintCount: 1,
                paints: [{ paint_uuid: 'p1', paint_name: 'Sunrise', paint_class_name: 'Paint_Sunrise', ship_name: 'Aurora MR', ship_uuid: 's1' }],
              },
            ],
          },
        ],
        total: 1,
        manufacturerOptions: [{ value: 'RSI', label: 'RSI', count: 1 }],
      }),
    },
  },
}));

describe('PaintsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the Paints heading', async () => {
    renderWithProviders(<PaintsPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /paints/i })).toBeInTheDocument());
  });

  it('renders paint name from API', async () => {
    renderWithProviders(<PaintsPage />);
    await waitFor(() => expect(screen.getByText('Sunrise')).toBeInTheDocument());
  });
});
