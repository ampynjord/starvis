import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../utils';
import NotFoundPage from '@/views/NotFoundPage';

describe('NotFoundPage', () => {
  it('renders 404 heading', () => {
    renderWithProviders(<NotFoundPage />);
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('renders "Unknown sector" label', () => {
    renderWithProviders(<NotFoundPage />);
    expect(screen.getByText(/unknown sector/i)).toBeInTheDocument();
  });

  it('renders the explanation text', () => {
    renderWithProviders(<NotFoundPage />);
    expect(screen.getByText(/does not exist in this quadrant/i)).toBeInTheDocument();
  });

  it('renders a link back to home', () => {
    renderWithProviders(<NotFoundPage />);
    const link = screen.getByRole('link', { name: /back to base/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });
});
