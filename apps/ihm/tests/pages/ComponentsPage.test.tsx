import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import ComponentsPage from '@/views/ComponentsPage';

vi.mock('@/services/api', () => ({
  api: {
    components: {
      filters: vi.fn().mockResolvedValue({ types: ['Weapons', 'Shields'], sub_types: [], manufacturers: [] }),
      list: vi.fn().mockResolvedValue({
        data: [{ uuid: 'c1', name: 'S1 Ballistic Gatling', type: 'Weapons', size: 1 }],
        total: 1,
        page: 1,
        limit: 20,
        pages: 1,
      }),
    },
  },
}));

describe('ComponentsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the Components heading', async () => {
    renderWithProviders(<ComponentsPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /components/i })).toBeInTheDocument());
  });

  it('renders component name from API', async () => {
    renderWithProviders(<ComponentsPage />);
    await waitFor(() => expect(screen.getByText('S1 Ballistic Gatling')).toBeInTheDocument());
  });
});
