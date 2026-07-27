import { describe, expect, it } from 'vitest';
import { stripInternal } from '../src/services/shared.js';
import { dataForgeUuidToScUuid } from '../src/utils/sc-uuid.js';

describe('dataForgeUuidToScUuid', () => {
  it('rend la forme employée par les outils tiers', () => {
    // Vérifié le 27/07/2026 contre api.star-citizen.wiki et finder.cstone.space,
    // qui référencent tous deux le Dragonfly Star Kitten sous cette forme.
    expect(dataForgeUuidToScUuid('5bcd4f7b-dfb9-d868-05d7-f7bba53a0aa4')).toBe('d868dfb9-5bcd-4f7b-a40a-3aa5bbf7d705');
  });

  it('accepte une entrée sans tirets', () => {
    expect(dataForgeUuidToScUuid('5bcd4f7bdfb9d86805d7f7bba53a0aa4')).toBe('d868dfb9-5bcd-4f7b-a40a-3aa5bbf7d705');
  });

  it('refuse un identifiant synthétique plutôt que d’en inventer un', () => {
    // `concept-71` désigne une entrée du Ship Matrix sans contrepartie dans le
    // jeu : lui donner une forme standard laisserait croire à une correspondance
    // qui n'existe pas.
    expect(dataForgeUuidToScUuid('concept-71')).toBeNull();
    expect(dataForgeUuidToScUuid('')).toBeNull();
    expect(dataForgeUuidToScUuid('pas-un-uuid')).toBeNull();
  });
});

describe('stripInternal', () => {
  it('ajoute sc_uuid sans toucher à uuid', () => {
    const row = stripInternal({ uuid: '5bcd4f7b-dfb9-d868-05d7-f7bba53a0aa4', name: 'Dragonfly Star Kitten' });
    expect(row.uuid).toBe('5bcd4f7b-dfb9-d868-05d7-f7bba53a0aa4');
    expect(row.sc_uuid).toBe('d868dfb9-5bcd-4f7b-a40a-3aa5bbf7d705');
    expect(row.name).toBe('Dragonfly Star Kitten');
  });

  it("n'ajoute rien quand l'identifiant n'est pas convertible", () => {
    const row = stripInternal({ uuid: 'concept-71', name: 'Orion' });
    expect(row.sc_uuid).toBeUndefined();
  });

  it('reste sans effet sur une ligne sans uuid', () => {
    const row = stripInternal({ name: 'Agricium', type: 'Metal' });
    expect(row).toEqual({ name: 'Agricium', type: 'Metal' });
  });
});
