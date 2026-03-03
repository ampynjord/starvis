import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ShipCard } from '@/components/ship/ShipCard';
import type { ShipListItem } from '@/types/api';

const baseShip: ShipListItem = {
  uuid: 'abc-123',
  name: 'Hornet F7C',
  manufacturer: 'Anvil Aerospace',
  manufacturer_code: 'ANVL',
  role: 'Combat',
  career: 'Combat',
  size: 2,
  crew_min: 1,
  crew_max: 1,
  mass: 65000,
  length: 22.5,
  width: 19.1,
  height: 5.5,
  scm_speed: 210,
  afterburner_speed: 1300,
  quantum_speed: null,
  has_sm_link: true,
  variant_type: null,
  focus: null,
};

function renderCard(ship: Partial<ShipListItem> = {}) {
  return render(
    <MemoryRouter>
      <ShipCard ship={{ ...baseShip, ...ship }} />
    </MemoryRouter>,
  );
}

describe('ShipCard', () => {
  it('affiche le nom du vaisseau', () => {
    renderCard();
    expect(screen.getByText('Hornet F7C')).toBeInTheDocument();
  });

  it('affiche le code fabricant', () => {
    renderCard();
    expect(screen.getByText('ANVL')).toBeInTheDocument();
  });

  it('affiche la carrière', () => {
    renderCard();
    expect(screen.getByText('Combat')).toBeInTheDocument();
  });

  it('affiche la taille comme badge', () => {
    renderCard();
    expect(screen.getByText('S2')).toBeInTheDocument();
  });

  it('affiche la vitesse SCM', () => {
    renderCard();
    expect(screen.getByText('210 m/s')).toBeInTheDocument();
  });

  it('affiche le crew (identique min/max)', () => {
    renderCard({ crew_min: 1, crew_max: 1 });
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('affiche la plage crew (min ≠ max)', () => {
    renderCard({ crew_min: 2, crew_max: 5 });
    // Le texte exact est "2–5" (tiret cadratin)
    expect(screen.getByText(/^2[–-]5$/)).toBeInTheDocument();
  });

  it('affiche — si scm_speed est null', () => {
    renderCard({ scm_speed: null });
    // '—' apparaît au moins une fois
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('affiche le badge variant_type collector', () => {
    renderCard({ variant_type: 'collector' });
    expect(screen.getByText('Collector')).toBeInTheDocument();
  });

  it('affiche le badge variant_type NPC', () => {
    renderCard({ variant_type: 'npc' });
    expect(screen.getByText('NPC')).toBeInTheDocument();
  });

  it('n\'affiche pas de badge variant_type si standard', () => {
    renderCard({ variant_type: 'standard' });
    expect(screen.queryByText('Standard')).not.toBeInTheDocument();
  });

  it('le lien mène vers la page du vaisseau', () => {
    renderCard();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/ships/abc-123');
  });

  it('n\'affiche pas le rôle s\'il est identique à la carrière', () => {
    renderCard({ career: 'Combat', role: 'Combat' });
    // Le rôle ne doit pas être dupliqué
    const badges = screen.getAllByText('Combat');
    expect(badges.length).toBe(1);
  });

  it('affiche le rôle si différent de la carrière', () => {
    renderCard({ career: 'Combat', role: 'Interception' });
    expect(screen.getByText('Interception')).toBeInTheDocument();
  });
});
