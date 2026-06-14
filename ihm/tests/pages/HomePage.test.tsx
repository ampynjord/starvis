import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import HomePage from '@/views/HomePage';

// Mock the api module
vi.mock('@/services/api', () => ({
  api: {
    stats: {
      overview: vi.fn().mockResolvedValue({
        ships: 309,
        components: 3023,
        items: 120,
        manufacturers: 42,
        commodities: 55,
        paints: 870,
      }),
      version: vi.fn().mockResolvedValue({
        game_version: '3.23.1',
        extracted_at: '2024-06-01T12:00:00Z',
      }),
    },
    ships: {
      random: vi.fn().mockResolvedValue({
        uuid: 'ship-1',
        name: 'Aegis Hammerhead',
        manufacturer_code: 'AEGS',
        role: 'Combat',
        career: 'Military',
        crew_size: 9,
        cargo_capacity: 0,
        scm_speed: 1200,
        max_speed: 1800,
        shield_hp: 45000,
        total_hp: 80000,
        mass: 150000,
        weapon_damage_total: 5000,
        missile_damage_total: 0,
        min_crew: 3,
        variant_type: 'Base',
        ship_matrix_id: null,
        thumbnail: null,
        production_status: 'flight-ready',
        boost_speed_forward: null,
        hydrogen_fuel_capacity: null,
        quantum_fuel_capacity: null,
      }),
    },
    changelog: {
      list: vi.fn().mockResolvedValue({
        data: [],
        total: 1000,
      }),
      summary: vi.fn().mockResolvedValue({
        total: 1000,
        last_extraction: '2024-06-01T12:00:00Z',
        by_change: { added: 10, modified: 5, removed: 2 },
        by_entity: { ship: 8, component: 9 },
      }),
    },
  },
}));

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the STARVIS title', () => {
    renderWithProviders(<HomePage />);
    expect(screen.getByText('STARVIS')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    renderWithProviders(<HomePage />);
    expect(screen.getByText('Star Citizen Database & Toolset')).toBeInTheDocument();
  });

  it('renders stat card labels', async () => {
    renderWithProviders(<HomePage />);
    await waitFor(() => {
      expect(screen.getAllByText('Ships & Vehicles').length).toBeGreaterThan(0);
      expect(screen.getAllByText('FPS & Equipment').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Universe').length).toBeGreaterThan(0);
    });
  });

  it('displays stats from API', async () => {
    renderWithProviders(<HomePage />);
    await waitFor(() => {
      expect(screen.getAllByText('309').length).toBeGreaterThan(0);
    });
  });

  it('renders ship spotlight section', async () => {
    renderWithProviders(<HomePage />);
    await waitFor(() => {
      expect(screen.getByText('Ship Spotlight')).toBeInTheDocument();
    });
  });

  it('renders Recent Changes section', async () => {
    renderWithProviders(<HomePage />);
    await waitFor(() => {
      expect(screen.getByText('Recent Changes')).toBeInTheDocument();
    });
  });

  it('renders game version when loaded', async () => {
    renderWithProviders(<HomePage />);
    await waitFor(() => {
      expect(screen.getByText(/3\.23\.1/)).toBeInTheDocument();
    });
  });
});
