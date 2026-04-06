import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import PaintsPage from '@/views/PaintsPage';

vi.mock('@/services/api', () => ({
  api: {
    paints: {
      list: vi.fn().mockResolvedValue({
        data: [{ paint_uuid: 'p1', paint_name: 'Sunrise', ship_name: 'Aurora MR', ship_uuid: 's1' }],
        total: 1,
        page: 1,
        limit: 40,
        pages: 1,
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
