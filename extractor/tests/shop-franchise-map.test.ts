import { describe, expect, it } from 'vitest';
import { buildFranchiseMap } from '../src/extractors/shop-extractor.js';

/**
 * La carte des franchises lisait `name` la ou le jeu ecrit `localizedName`.
 *
 * Le defaut ne se voyait pas : la carte se construisait, comptait bien ses 37
 * enregistrements, et n'en portait aucune cle. Les noms commerciaux du jeu
 * n'ont jamais servi, et la decoupe franchise/lieu — qui se sert de cette carte
 * comme dictionnaire de prefixes connus — retombait toujours sur le premier
 * segment du nom de fichier.
 *
 * Le controle porte sur le nom du champ, parce que c'est lui qui a derive.
 */
function fakeContext(fields: Record<string, unknown>) {
  return {
    getDfData: () => ({
      structDefs: [{ name: 'ShopFranchise' }],
      records: [{ structIndex: 0, instanceIndex: 0, name: 'ShopFranchise.SF_cordrys' }],
    }),
    readInstance: () => fields,
  } as never;
}

describe('buildFranchiseMap', () => {
  it('lit la cle de localisation dans `localizedName`', () => {
    const map = buildFranchiseMap(fakeContext({ __type: 'ShopFranchise', localizedName: '@shop_name_cordrys' }));
    expect(map.get('cordrys')).toEqual({ locKey: '@shop_name_cordrys', name: null });
  });

  it('ne prend pas `name` pour la cle', () => {
    // `name` existe sur d'autres structures DataForge : le confondre rendait
    // une carte pleine d'entrees vides, ce qui ne ressemble pas a une panne.
    const map = buildFranchiseMap(fakeContext({ __type: 'ShopFranchise', name: '@autre_chose' }));
    expect(map.get('cordrys')).toEqual({ locKey: '', name: null });
  });
});
