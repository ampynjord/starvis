import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from '@/components/ui/Pagination';

describe('Pagination', () => {
  it('ne rend rien si totalPages <= 1', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} onPageChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('affiche toutes les pages si totalPages <= 7', () => {
    render(<Pagination page={1} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('appelle onPageChange avec la bonne page au clic', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={1} totalPages={5} onPageChange={onPageChange} />);

    await user.click(screen.getByText('3'));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('désactive le bouton précédent sur la première page', () => {
    render(<Pagination page={1} totalPages={5} onPageChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    // Premier bouton = chevron précédent
    expect(buttons[0]).toBeDisabled();
  });

  it('désactive le bouton suivant sur la dernière page', () => {
    render(<Pagination page={5} totalPages={5} onPageChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    // Dernier bouton = chevron suivant
    expect(buttons[buttons.length - 1]).toBeDisabled();
  });

  it('navigue vers la page précédente via le chevron', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onPageChange={onPageChange} />);

    const buttons = screen.getAllByRole('button');
    await user.click(buttons[0]); // chevron gauche
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('navigue vers la page suivante via le chevron', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onPageChange={onPageChange} />);

    const buttons = screen.getAllByRole('button');
    await user.click(buttons[buttons.length - 1]); // chevron droit
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('affiche des ellipses pour beaucoup de pages', () => {
    render(<Pagination page={5} totalPages={20} onPageChange={vi.fn()} />);
    const ellipses = screen.getAllByText('…');
    expect(ellipses.length).toBeGreaterThanOrEqual(1);
  });

  it('met en évidence la page courante', () => {
    render(<Pagination page={3} totalPages={5} onPageChange={vi.fn()} />);
    const page3Button = screen.getByText('3');
    expect(page3Button).toHaveClass('text-cyan-400');
  });
});
