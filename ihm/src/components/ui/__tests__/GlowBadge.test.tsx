import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlowBadge } from '@/components/ui/GlowBadge';

describe('GlowBadge', () => {
  it('affiche le texte enfant', () => {
    render(<GlowBadge>Collector</GlowBadge>);
    expect(screen.getByText('Collector')).toBeInTheDocument();
  });

  it('utilise la couleur slate par défaut', () => {
    const { container } = render(<GlowBadge>Test</GlowBadge>);
    expect(container.firstChild).toHaveClass('text-slate-400');
  });

  it('applique la couleur cyan', () => {
    const { container } = render(<GlowBadge color="cyan">Test</GlowBadge>);
    expect(container.firstChild).toHaveClass('text-cyan-400');
  });

  it('applique la couleur amber', () => {
    const { container } = render(<GlowBadge color="amber">Test</GlowBadge>);
    expect(container.firstChild).toHaveClass('text-amber-400');
  });

  it('applique la couleur red', () => {
    const { container } = render(<GlowBadge color="red">Test</GlowBadge>);
    expect(container.firstChild).toHaveClass('text-red-400');
  });

  it('applique la couleur green', () => {
    const { container } = render(<GlowBadge color="green">Test</GlowBadge>);
    expect(container.firstChild).toHaveClass('text-green-400');
  });

  it('applique la couleur purple', () => {
    const { container } = render(<GlowBadge color="purple">Test</GlowBadge>);
    expect(container.firstChild).toHaveClass('text-purple-400');
  });

  it('utilise text-xs par défaut (size=xs)', () => {
    const { container } = render(<GlowBadge>Test</GlowBadge>);
    expect(container.firstChild).toHaveClass('text-xs');
  });

  it('utilise text-sm pour size=sm', () => {
    const { container } = render(<GlowBadge size="sm">Test</GlowBadge>);
    expect(container.firstChild).toHaveClass('text-sm');
  });

  it('accepte une className supplémentaire', () => {
    const { container } = render(<GlowBadge className="custom-class">Test</GlowBadge>);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('rend un span', () => {
    render(<GlowBadge>Test</GlowBadge>);
    expect(screen.getByText('Test').tagName).toBe('SPAN');
  });
});
