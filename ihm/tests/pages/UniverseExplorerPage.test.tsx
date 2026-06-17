import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import UniverseExplorerPage from '@/views/UniverseExplorerPage';

describe('UniverseExplorerPage', () => {
  it('renders the RSI starmap iframe', () => {
    renderWithProviders(<UniverseExplorerPage />);
    const iframe = screen.getByTitle('RSI Ark Starmap');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', 'https://robertsspaceindustries.com/starmap');
  });
});
