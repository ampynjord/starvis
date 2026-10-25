import { describe, expect, it } from 'vitest';
import { CATEGORY_META, SUB_CATEGORY_LABELS, UniverseNexusService } from '../src/services/universe-nexus-service.js';

describe('UniverseNexusService & Taxonomy', () => {
  it('defines all required in-game categories in metadata', () => {
    const requiredCategories = [
      'ships',
      'vehicles',
      'armor',
      'clothing',
      'weapons',
      'utility',
      'ammo',
      'sustenance',
      'locations',
      'commodities',
    ];

    for (const cat of requiredCategories) {
      expect(CATEGORY_META[cat]).toBeDefined();
      expect(CATEGORY_META[cat].label_fr).toBeTruthy();
      expect(CATEGORY_META[cat].label_en).toBeTruthy();
      expect(CATEGORY_META[cat].icon).toBeTruthy();
    }
  });

  it('defines human labels for all official subcategories', () => {
    const sampleSubCategories = [
      'flight-ready',
      'in-concept',
      'lore',
      'weapons',
      'turrets',
      'missile_racks',
      'quantum_drives',
      'jump_modules',
      'helmets',
      'undersuits',
      'core',
      'jackets',
      'shirts',
      'primary',
      'sidearms',
      'gadgets',
      'medical',
      'magazines',
      'food',
      'drink',
      'bunkers',
      'stations',
      'metals',
      'minerals',
    ];

    for (const sub of sampleSubCategories) {
      expect(SUB_CATEGORY_LABELS[sub]).toBeDefined();
      expect(SUB_CATEGORY_LABELS[sub].fr).toBeTruthy();
      expect(SUB_CATEGORY_LABELS[sub].en).toBeTruthy();
    }
  });

  it('correctly separates JumpModule from QuantumDrive labels', () => {
    expect(SUB_CATEGORY_LABELS.jump_modules.fr).toBe('Modules de saut');
    expect(SUB_CATEGORY_LABELS.quantum_drives.fr).toBe('Propulseurs quantiques');
  });

  it('getTaxonomy returns structured categories with real totals and subcategories', async () => {
    const mockPrisma = {
      $queryRawUnsafe: async () => [
        { cat: 'ships', sub_cat: 'flight-ready', count: 280 },
        { cat: 'ships', sub_cat: 'in-concept', count: 29 },
        { cat: 'vehicles', sub_cat: 'weapons', count: 300 },
        { cat: 'vehicles', sub_cat: 'jump_modules', count: 5 },
        { cat: 'armor', sub_cat: 'helmets', count: 97 },
        { cat: 'armor', sub_cat: 'core', count: 520 },
      ],
    };

    const service = new UniverseNexusService(mockPrisma as any);
    const taxonomy = await service.getTaxonomy('live');

    expect(taxonomy.length).toBe(10);
    const shipsCat = taxonomy.find((c) => c.id === 'ships');
    expect(shipsCat).toBeDefined();
    expect(shipsCat?.total).toBe(309);
    expect(shipsCat?.subCategories.length).toBe(2);

    const vehiclesCat = taxonomy.find((c) => c.id === 'vehicles');
    expect(vehiclesCat).toBeDefined();
    expect(vehiclesCat?.total).toBe(305);
    expect(vehiclesCat?.subCategories.some((s) => s.id === 'jump_modules')).toBe(true);
  });
});
