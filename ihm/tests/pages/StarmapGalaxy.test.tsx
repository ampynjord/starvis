import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../utils';

vi.mock('@/services/api', () => ({
  api: { starmap: { positions: vi.fn().mockResolvedValue([]) } },
}));

import { StarmapGalaxy } from '@/components/starmap/StarmapGalaxy';

describe('StarmapGalaxy', () => {
  it('renders an empty state when no star systems have coordinates', async () => {
    renderWithProviders(<StarmapGalaxy />);
    expect(await screen.findByText(/No star systems/i)).toBeInTheDocument();
  });
});
