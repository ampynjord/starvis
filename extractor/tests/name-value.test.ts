import { describe, expect, it } from 'vitest';
import { classifyNameValue } from '../src/dataforge/dataforge-utils.js';

/**
 * DataForge mélange trois sortes de valeurs dans les champs de nom. Les
 * confondre est ce qui privait les 135 marchandises de tout libellé propre : la
 * clé de localisation, seule capable de donner le vrai nom, était écartée parce
 * qu'elle n'est pas affichable, et la persistance retombait sur l'identifiant.
 */
describe('classifyNameValue', () => {
  it('retient un libellé affichable', () => {
    expect(classifyNameValue('Arrowhead Sniper Rifle')).toEqual({ display: 'Arrowhead Sniper Rifle' });
  });

  it('conserve la clé de localisation au lieu de la jeter', () => {
    // Le cas qui comptait : cette clé résout « Agricultural Supplies », là où le
    // repli sur l'identifiant produisait « Agriculturalsupplies ».
    expect(classifyNameValue('@items_commodities_agriculturalSupplies')).toEqual({
      locKey: '@items_commodities_agriculturalSupplies',
    });
  });

  it('écarte les identifiants internes LOC_, qui ne sont ni un nom ni une clé', () => {
    expect(classifyNameValue('LOC_EMPTY')).toEqual({});
  });

  it('ignore les valeurs absentes ou non textuelles', () => {
    expect(classifyNameValue(undefined)).toEqual({});
    expect(classifyNameValue(null)).toEqual({});
    expect(classifyNameValue('')).toEqual({});
    expect(classifyNameValue(42)).toEqual({});
  });

  it('ne confond pas une clé avec un libellé qui contiendrait une arobase', () => {
    // Seul le préfixe fait la clé : une arobase au milieu reste du texte.
    expect(classifyNameValue('Pizza @ Hurston')).toEqual({ display: 'Pizza @ Hurston' });
  });
});
