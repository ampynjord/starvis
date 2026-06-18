import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../utils';

vi.mock('@/services/api', () => ({
  api: { starmap: { positions: vi.fn().mockResolvedValue([]) } },
}));

import { StarmapGalaxy } from '@/components/starmap/StarmapGalaxy';

describe('StarmapGalaxy', () => {
  it('renders an empty state when no RSI starmap objects have coordinates', async () => {
    renderWithProviders(<StarmapGalaxy />);
    expect(await screen.findByText(/No RSI starmap objects/i)).toBeInTheDocument();
  });
});
