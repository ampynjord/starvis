import { describe, expect, it } from 'vitest';
import { CONCEPT_SELECT_COLUMNS, SHIP_SELECT_COLUMNS, selectAlias } from '../src/services/ships/ship-helpers.js';

/**
 * Les deux branches de l'union doivent exposer la même forme.
 *
 * `/api/v1/ships` réunit par `UNION ALL` les vaisseaux extraits du jeu et les
 * vaisseaux-concepts, qui n'existent qu'au Ship Matrix. PostgreSQL exige alors
 * le même nombre de colonnes, et apparie **par position** : une colonne ajoutée
 * d'un seul côté ne produit aucune erreur de compilation — elle casse la requête
 * en production, ou pire, décale silencieusement les valeurs si les types sont
 * compatibles.
 *
 * Rien ne gardait cet invariant. Ces tests le figent.
 */
describe('forme des deux branches de l’union des vaisseaux', () => {
  const shipAliases = SHIP_SELECT_COLUMNS.map(selectAlias);
  const conceptAliases = CONCEPT_SELECT_COLUMNS.map(selectAlias);

  it('expose le même nombre de colonnes', () => {
    expect(conceptAliases).toHaveLength(shipAliases.length);
  });

  it('expose les mêmes colonnes, dans le même ordre', () => {
    // L'appariement d'un UNION se fait par position : comparer les ensembles ne
    // suffirait pas, deux colonnes permutées passeraient.
    expect(conceptAliases).toEqual(shipAliases);
  });

  it('ne laisse aucune colonne sans nom exploitable', () => {
    for (const alias of [...shipAliases, ...conceptAliases]) {
      expect(alias).toMatch(/^[a-z_][a-z0-9_]*$/);
    }
  });
});

describe('selectAlias', () => {
  it('retient le nom explicite', () => {
    expect(selectAlias('sm2.focus as role')).toBe('role');
    expect(selectAlias('COALESCE(sm.name, s.name) as name')).toBe('name');
  });

  it('retire le préfixe de table à défaut', () => {
    expect(selectAlias('s.cargo_capacity')).toBe('cargo_capacity');
    expect(selectAlias('s.uuid')).toBe('uuid');
  });

  it('reconnaît un alias derrière un transtypage', () => {
    expect(selectAlias('0::integer as purchase_location_count')).toBe('purchase_location_count');
  });
});
