/**
 * Les deux formes d'identifiant Star Citizen.
 *
 * Un même objet porte deux UUID selon la source : la forme « standard » chez
 * UEX, le wiki communautaire et les outils tiers, et la forme réordonnée du
 * GUID DataForge, que Starvis stocke et expose.
 *
 * Le Dragonfly Star Kitten est `d868dfb9-5bcd-4f7b-a40a-3aa5bbf7d705` pour
 * `api.star-citizen.wiki` et `finder.cstone.space`, mais
 * `5bcd4f7b-dfb9-d868-05d7-f7bba53a0aa4` ici. Les mêmes octets, dans un autre
 * ordre — ce qui empêchait jusqu'ici un développeur tiers de joindre les données
 * Starvis à celles des autres projets par identifiant.
 *
 * Exposer les deux lève cet obstacle sans rien casser : `uuid` ne bouge pas,
 * `sc_uuid` s'ajoute.
 */

const UUID_HEX = /^[0-9a-f]{32}$/;

/**
 * Convertit un GUID DataForge vers la forme standard.
 *
 * Renvoie `null` quand l'entrée n'est pas un UUID hexadécimal de 32 signes —
 * c'est le cas des identifiants synthétiques comme `concept-71`, qui désignent
 * une entrée du Ship Matrix sans contrepartie dans le jeu. Leur inventer une
 * forme standard laisserait croire à une correspondance qui n'existe pas.
 */
export function dataForgeUuidToScUuid(uuid: string): string | null {
  const hex = uuid.replace(/-/g, '').toLowerCase();
  if (!UUID_HEX.test(hex)) return null;
  const b = hex.match(/../g);
  if (!b || b.length !== 16) return null;
  const r = [...b.slice(6, 8), ...b.slice(4, 6), ...b.slice(0, 4), ...b.slice(10, 16).reverse(), ...b.slice(8, 10).reverse()];
  return `${r.slice(0, 4).join('')}-${r.slice(4, 6).join('')}-${r.slice(6, 8).join('')}-${r.slice(8, 10).join('')}-${r.slice(10, 16).join('')}`;
}
