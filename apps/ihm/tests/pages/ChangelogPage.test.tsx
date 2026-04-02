import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import ChangelogPage from '@/views/ChangelogPage';

vi.mock('@/services/api', () => ({
  api: {
    changelog: {
      list: vi.fn().mockResolvedValue({
        data: [
          { id: 1, entity_type: 'ship', entity_name: 'Aurora MR', change_type: 'added', extracted_at: '2024-06-01T12:00:00Z' },
        ],
        total: 1,
      }),
      summary: vi.fn().mockResolvedValue({
        total: 1000,
        last_extraction: '2024-06-01T12:00:00Z',
        by_change: { added: 10, modified: 5, removed: 2 },
      }),
    },
  },
}));

describe('ChangelogPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the Changelog heading', async () => {
    renderWithProviders(<ChangelogPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /changelog/i })).toBeInTheDocument());
  });
});
