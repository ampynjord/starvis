import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import LocationsPage from '@/views/LocationsPage';

vi.mock('@/services/api', () => ({
  api: {
    locations: {
      all: vi.fn().mockResolvedValue([
        { uuid: 'l1', name: 'Stanton', type: 'StarSystem', system_code: 'STAN', parent_uuid: null },
        { uuid: 'l2', name: 'Hurston', type: 'Planet', system_code: 'STAN', parent_uuid: 'l1' },
      ]),
    },
  },
}));

describe('LocationsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the Locations heading', async () => {
    renderWithProviders(<LocationsPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /locations/i })).toBeInTheDocument());
  });

  it('renders location names from API', async () => {
    renderWithProviders(<LocationsPage />);
    await waitFor(() => {
      expect(screen.getByText('Stanton')).toBeInTheDocument();
    });
  });
});
