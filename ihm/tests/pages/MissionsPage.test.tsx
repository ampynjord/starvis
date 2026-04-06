import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import MissionsPage from '@/views/MissionsPage';

vi.mock('@/services/api', () => ({
  api: {
    missions: {
      types: vi.fn().mockResolvedValue(['Bounty', 'Delivery', 'Salvage']),
      factions: vi.fn().mockResolvedValue(['PDD', 'Crusader', 'Hurston']),
      categories: vi.fn().mockResolvedValue(['Combat', 'Logistics']),
      list: vi.fn().mockResolvedValue({
        data: [{ uuid: 'm1', title: 'Eliminate Target', type: 'Bounty', is_legal: true }],
        total: 1,
        page: 1,
        limit: 20,
        pages: 1,
      }),
    },
  },
}));

describe('MissionsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the Mission Database heading', async () => {
    renderWithProviders(<MissionsPage />);
    await waitFor(() => expect(screen.getByText('Mission Database')).toBeInTheDocument());
  });

  it('renders mission titles from API', async () => {
    renderWithProviders(<MissionsPage />);
    await waitFor(() => expect(screen.getByText('Eliminate Target')).toBeInTheDocument());
  });
});
