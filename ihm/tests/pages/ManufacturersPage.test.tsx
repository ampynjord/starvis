import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import ManufacturersPage from '@/views/ManufacturersPage';

vi.mock('@/services/api', () => ({
  api: {
    manufacturers: {
      list: vi.fn().mockResolvedValue([
        { code: 'ANVL', name: 'Anvil Aerospace', ship_count: 10, component_count: 5, item_count: 3 },
        { code: 'RSI', name: 'Roberts Space Industries', ship_count: 15, component_count: 8, item_count: 6 },
      ]),
      ships: vi.fn().mockResolvedValue([]),
      components: vi.fn().mockResolvedValue([]),
      items: vi.fn().mockResolvedValue([]),
    },
  },
}));

describe('ManufacturersPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the Manufacturers heading', async () => {
    renderWithProviders(<ManufacturersPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /manufacturers/i })).toBeInTheDocument());
  });

  it('renders manufacturer names from API', async () => {
    renderWithProviders(<ManufacturersPage />);
    await waitFor(() => {
      expect(screen.getAllByText(/Anvil Aerospace/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Roberts Space Industries/).length).toBeGreaterThan(0);
    });
  });
});
