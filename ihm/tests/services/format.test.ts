import { describe, expect, it } from 'vitest';
import { EMPTY_VALUE, formatCompact, formatCount, formatDecimal, formatPercent, formatWithUnit } from '@/lib/format';

describe('formatage numérique', () => {
  it('distingue décimales fixes et séparateurs de milliers', () => {
    // Le piège d'origine : deux `fNum` de sémantique différente selon le fichier.
    expect(formatDecimal(12500.456, 2)).toBe('12500.46');
    expect(formatCount(12500.456, 0)).toBe('12,500');
  });

  it('rend une valeur vide de façon uniforme', () => {
    for (const absent of [null, undefined, 'abc', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(formatDecimal(absent as never)).toBe(EMPTY_VALUE);
      expect(formatCount(absent as never)).toBe(EMPTY_VALUE);
      expect(formatPercent(absent as never)).toBe(EMPTY_VALUE);
      expect(formatWithUnit(absent as never, 'm/s')).toBe(EMPTY_VALUE);
      expect(formatCompact(absent as never)).toBe(EMPTY_VALUE);
    }
  });

  it("n'ajoute pas de décimale sans qu'on la demande", () => {
    // Régression évitée : un défaut à 2 affichait « 220.00 m/s » sur les fiches
    // vaisseaux là où la production montre « 220 m/s ».
    expect(formatDecimal(220)).toBe('220');
    expect(formatDecimal(220, 2)).toBe('220.00');
  });

  it('accepte les nombres transmis sous forme de chaîne', () => {
    // Les valeurs numériques de l'API arrivent parfois en chaîne (colonnes NUMERIC).
    expect(formatDecimal('3.14159', 2)).toBe('3.14');
    expect(formatCount('1500')).toBe('1,500');
  });

  it('convertit une fraction en pourcentage', () => {
    expect(formatPercent(0.42)).toBe('42.0%');
    expect(formatPercent(1)).toBe('100.0%');
  });

  it('suffixe une unité, et la rend optionnelle', () => {
    expect(formatWithUnit(220, 'm/s', 0)).toBe('220 m/s');
    expect(formatWithUnit(220, '', 0)).toBe('220');
  });

  it('abrège les grands nombres', () => {
    expect(formatCompact(1_250_000)).toBe('1.3M');
    expect(formatCompact(3400)).toBe('3.4k');
    expect(formatCompact(42)).toBe('42');
    expect(formatCompact(-2_000_000)).toBe('-2.0M');
  });
});
