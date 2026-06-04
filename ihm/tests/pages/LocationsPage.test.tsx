import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import LocationsPage from '@/views/LocationsPage';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'tester', role: 'user' }, loading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refresh: vi.fn() }),
  AuthProvider: ({ children }: { children: any }) => children,
}));

vi.mock('@/services/api', () => ({
  api: {
    starmap: {
      positions: vi.fn().mockResolvedValue([
        { id: 1, rsi_id: '1', name: 'Stanton', type: 'star', system_code: 'STAN', parent_id: null, coordinates: { x: 0, y: 0, z: 0 } },
        { id: 2, rsi_id: '2', name: 'Hurston', type: 'planet', system_code: 'STAN', parent_id: 1, coordinates: { x: 10, y: 0, z: 0 } },
      ]),
    },
    locations: {
      all: vi.fn().mockResolvedValue([
        {
          uuid: 'game-hurston',
          name: 'Hurston',
          type: 'Planet',
          system_code: 'STAN',
          parent_uuid: null,
          rsi_starmap_location_id: 2,
          class_name: 'HurstonPlanet',
          loc_key: 'hurston',
          is_scannable: true,
          hide_in_starmap: false,
        },
      ]),
    },
    shops: {
      list: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 0, pages: 0 }),
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
