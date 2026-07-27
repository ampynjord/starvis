/**
 * Nommage des vaisseaux absents du Ship Matrix.
 *
 * Première règle nommée de la couche de croisement : chacune énonce sa condition
 * d'application, sa source, et ce qu'elle refuse de faire.
 *
 * ── Le problème ──────────────────────────────────────────────────────────────
 *
 * L'API sert `COALESCE(sm.name, s.name)` : un vaisseau rattaché au Ship Matrix
 * affiche le nom commercial de RSI, ce qui est juste. Les autres retombent sur
 * le nom interne, et celui-ci est une nomenclature d'atelier — « Prospector
 * Collector Indust », « Dragonfly Pink », « Lightning F8C Collector Stealth ».
 *
 * Ces vaisseaux sont les variantes de récompense (Wikelo, PYAM Exec) que RSI ne
 * vend pas et ne référence donc nulle part. Leur seul nom public est celui que
 * le jeu porte dans `global.ini` : « Prospector Wikelo Work Special »,
 * « Dragonfly Star Kitten », « F8C Lightning Wikelo Sneak Special ».
 *
 * ── Pourquoi seulement ceux-là ───────────────────────────────────────────────
 *
 * Le croisement P4K ↔ Ship Matrix se fait par nom normalisé. Renommer un
 * vaisseau déplace donc son entrée dans l'index de correspondance, et un
 * vaisseau qui perd son lien peut être élagué — c'est ce qui avait fait
 * disparaître deux vaisseaux du 4.9.0 en juillet.
 *
 * Mesuré sur la base du 4.9.0 : renommer **tous** les vaisseaux fait tomber le
 * rattachement de 213 à 204. Renommer les seuls non rattachés le laisse à 213 —
 * ils n'ont aucun lien à perdre, et leur nouveau nom n'en vole aucun.
 *
 * La règle s'arrête donc là. Le renommage général suppose d'abord de refondre
 * `SM_TO_P4K_ALIASES`, dont les 81 entrées existent précisément pour compenser
 * les noms internes actuels.
 */
import type { PoolClient } from 'pg';
import logger from '../logger.js';
import type { GameEnv } from '../module-registry.js';
import type { LocalizationService } from './localization-service.js';

/**
 * Marques telles que le jeu les écrit en tête d'un nom, quand ni la raison
 * sociale ni le code du constructeur ne permettent de les reconnaître.
 */
const BRAND_PREFIXES = ['Vanduul', 'Mirai', 'Esperia', 'Tumbril', 'Greycat', "Grey's", 'C.O.', 'Kruger', 'Xi’an', 'Xian'];

/**
 * Retire le constructeur en tête du nom.
 *
 * Le jeu écrit « Aegis Idris-P Wikelo War Special » ; Starvis porte le
 * constructeur dans une colonne dédiée et l'affiche à part. Le répéter dans le
 * libellé le ferait apparaître deux fois, et romprait la convention du reste du
 * catalogue, où le Gladius s'appelle « Gladius » et non « Aegis Gladius ».
 */
export function stripManufacturerPrefix(gameName: string, manufacturerName: string | null, manufacturerCode: string | null): string {
  const candidates = [manufacturerName, manufacturerName?.split(' ')[0], manufacturerCode, ...BRAND_PREFIXES].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (gameName.toLowerCase().startsWith(`${candidate.toLowerCase()} `)) {
      return gameName.slice(candidate.length + 1).trim();
    }
  }
  return gameName;
}

/**
 * `global.ini` écrit la clé sans séparateur après `vehicle_Name`.
 *
 * `LocalizationService.resolveShipName` ne teste que la forme
 * `vehicle_Name_<Classe>` et ne résout donc aucun vaisseau. Corriger cette
 * méthode changerait les noms de toute la flotte — donc les rattachements ;
 * cette règle passe volontairement par la clé brute pour ne toucher que les
 * vaisseaux qu'elle vise.
 */
export function resolveGameShipName(loc: LocalizationService, className: string): string | null {
  const raw = loc.resolveKey(`vehicle_Name${className}`);
  if (!raw) return null;
  // Certaines entrées portent un « \n » littéral (« CSV-SM\n »).
  const cleaned = raw.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

/**
 * Applique le nom du jeu aux vaisseaux sans entrée au Ship Matrix.
 *
 * À exécuter **après** l'élagage des variantes : renommer avant modifierait ce
 * que l'élagage voit.
 */
export async function nameShipsMissingFromShipMatrix(
  conn: PoolClient,
  env: GameEnv,
  loc: LocalizationService,
  onProgress?: (msg: string) => void,
): Promise<number> {
  if (!loc.isLoaded) {
    logger.warn('Localization not loaded — ships missing from Ship Matrix keep their internal name', {
      module: 'ship-naming',
    });
    return 0;
  }

  const { rows } = await conn.query<{
    uuid: string;
    class_name: string;
    name: string;
    manufacturer_name: string | null;
    manufacturer_code: string | null;
  }>(
    `SELECT s.uuid, s.class_name, s.name, s.manufacturer_code, m.name AS manufacturer_name
       FROM game.ships s
       LEFT JOIN game.manufacturers m ON m.code = s.manufacturer_code
      WHERE s.env = $1 AND s.ship_matrix_id IS NULL`,
    [env],
  );

  let renamed = 0;
  for (const ship of rows) {
    const gameName = resolveGameShipName(loc, ship.class_name);
    if (!gameName) continue;
    const display = stripManufacturerPrefix(gameName, ship.manufacturer_name, ship.manufacturer_code);
    if (!display || display === ship.name) continue;

    await conn.query('UPDATE game.ships SET name = $1 WHERE uuid = $2 AND env = $3', [display, ship.uuid, env]);
    // Tracé nominativement : un renommage silencieux serait indistinguable d'une
    // erreur d'extraction lors du prochain diff.
    logger.info(`Ship renamed from game localization: "${ship.name}" → "${display}"`, {
      module: 'ship-naming',
      className: ship.class_name,
    });
    renamed++;
  }

  if (renamed > 0) onProgress?.(`Named ${renamed} ships absent from the Ship Matrix using game localization`);
  return renamed;
}
