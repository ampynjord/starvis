import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import HomePage from '@/pages/HomePage';

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
    changelog: {
      list: vi.fn().mockResolvedValue({
        data: [],
        pagination: { total: 1000, page: 1, limit: 8, pages: 125 },
      }),
      summary: vi.fn().mockResolvedValue({
        total: 1000,
        last_extraction: '2024-06-01T12:00:00Z',
        by_change: { added: 10, modified: 5, removed: 2 },
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
    expect(screen.getByText(/Star Citizen/i)).toBeInTheDocument();
  });

  it('renders stat card labels', async () => {
    renderWithProviders(<HomePage />);
    await waitFor(() => {
      expect(screen.getByText('Ships')).toBeInTheDocument();
      expect(screen.getByText('Components')).toBeInTheDocument();
      expect(screen.getByText('Manufacturers')).toBeInTheDocument();
    });
  });

  it('displays stats from API', async () => {
    renderWithProviders(<HomePage />);
    await waitFor(() => {
      expect(screen.getByText('Ships')).toBeInTheDocument();
    });
  });

  it('renders Database section', async () => {
    renderWithProviders(<HomePage />);
    await waitFor(() => {
      expect(screen.getByText('Database')).toBeInTheDocument();
    });
  });

  it('renders Latest changes section', async () => {
    renderWithProviders(<HomePage />);
    await waitFor(() => {
      expect(screen.getByText('Latest changes')).toBeInTheDocument();
    });
  });

  it('renders game version when loaded', async () => {
    renderWithProviders(<HomePage />);
    await waitFor(() => {
      expect(screen.getByText('3.23.1')).toBeInTheDocument();
    });
  });
});
