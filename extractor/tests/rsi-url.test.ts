import { describe, expect, it } from 'vitest';
import { RSI_BASE_URL, resolveRsiUrl } from '../src/config.js';

/**
 * Le scraper CTM fabriquait
 * `robertsspaceindustries.comhttps//robertsspaceindustries.com/pledge/ships/…`
 * et chaque vaisseau échouait sur un nom de domaine introuvable.
 *
 * La cause n'était pas une faute de frappe : la synchronisation du Ship Matrix
 * s'est mise à stocker l'URL absolue, et le seul des huit appelants qui ne se
 * gardait pas a collé la base par-dessus. Ces contrôles portent donc sur la
 * forme d'entrée, puisque c'est elle qui a changé.
 */
describe('resolveRsiUrl', () => {
  it('laisse une adresse déjà absolue intacte', () => {
    const absolute = `${RSI_BASE_URL}/pledge/ships/anvil-arrow/Arrow`;
    expect(resolveRsiUrl(absolute)).toBe(absolute);
    expect(resolveRsiUrl('http://robertsspaceindustries.com/x')).toBe('http://robertsspaceindustries.com/x');
  });

  it('enracine une adresse relative, avec ou sans barre de tête', () => {
    expect(resolveRsiUrl('/pledge/ships/aurora/Aurora-MR')).toBe(`${RSI_BASE_URL}/pledge/ships/aurora/Aurora-MR`);
    expect(resolveRsiUrl('pledge/ships/aurora/Aurora-MR')).toBe(`${RSI_BASE_URL}/pledge/ships/aurora/Aurora-MR`);
  });

  it('ne double jamais la barre de séparation', () => {
    expect(resolveRsiUrl('//')).toBe('https://');
    expect(resolveRsiUrl('///pledge')).toBe('https:///pledge');
    expect(resolveRsiUrl('/x')).not.toContain('com//');
  });

  it('donne son protocole à une adresse qui n’en a pas', () => {
    // Les médias RSI arrivent sous cette forme ; les coller à la base
    // produirait une adresse invalide.
    expect(resolveRsiUrl('//media.robertsspaceindustries.com/a/b.jpg')).toBe('https://media.robertsspaceindustries.com/a/b.jpg');
  });

  it('rend null sur une entrée vide plutôt qu’une adresse tronquée', () => {
    for (const empty of [null, undefined, '', '   ']) {
      expect(resolveRsiUrl(empty), String(empty)).toBeNull();
    }
  });
});
