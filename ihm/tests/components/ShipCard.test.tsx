import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ShipCard } from '@/components/ship/ShipCard';
import type { ShipListItem } from '@/types/api';

const baseShip: ShipListItem = {
  uuid: 'abc-123',
  name: 'Hornet F7C',
  short_name: 'F7C',
  class_name: 'ANVL_HornetF7C',
  manufacturer_name: 'Anvil Aerospace',
  manufacturer_code: 'ANVL',
  role: 'Combat',
  career: 'Combat',
  vehicle_category: null,
  crew_size: 1,
  mass: 65000,
  cross_section_x: 19.1,
  cross_section_y: 5.5,
  cross_section_z: 22.5,
  scm_speed: 210,
  max_speed: 1300,
  boost_speed_forward: null,
  cargo_capacity: null,
  ship_matrix_id: 1,
  thumbnail: null,
  production_status: null,
  variant_type: null,
  is_concept_only: false,
};

function renderCard(ship: Partial<ShipListItem> = {}) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
    expect(screen.getAllByText('ANVL').length).toBeGreaterThanOrEqual(1);
  });

  it('displays the career', () => {
    renderCard();
    expect(screen.getByText('Combat')).toBeInTheDocument();
  });

  it('affiche la taille (vehicle_category) si défini', () => {
    renderCard({ vehicle_category: 'Ship' });
    expect(screen.getByText('Ship')).toBeInTheDocument();
  });

  it('affiche la vitesse SCM', () => {
    renderCard();
    expect(screen.getByText('210 m/s')).toBeInTheDocument();
  });

  it('affiche le crew', () => {
    renderCard({ crew_size: 1 });
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('affiche — si scm_speed est null', () => {
    renderCard({ scm_speed: null });
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('affiche le badge variant_type collector', () => {
    renderCard({ variant_type: 'collector' });
    expect(screen.getByText('Collector')).toBeInTheDocument();
  });

  it('affiche le badge variant_type NPC', () => {
    renderCard({ variant_type: 'npc' });
    expect(screen.getByText(/npc/i)).toBeInTheDocument();
  });

  it("n'affiche pas de badge variant_type si standard", () => {
    renderCard({ variant_type: 'standard' });
    expect(screen.queryByText('Standard')).not.toBeInTheDocument();
  });

  it('the link leads to the ship page', () => {
    renderCard();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/ships/abc-123');
  });

  it('does not show role if it is the same as career', () => {
    renderCard({ career: 'Combat', role: 'Combat' });
    const badges = screen.getAllByText('Combat');
    expect(badges.length).toBe(1);
  });

  it('shows role if different from career', () => {
    renderCard({ career: 'Combat', role: 'Interception' });
    expect(screen.getByText('Interception')).toBeInTheDocument();
  });
});
