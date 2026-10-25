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
 * Noms encore collés à la nomenclature d'atelier DataForge, même après un
 * premier passage de localisation (ex. « Pulse Collector Civ »,
 * « Corsair Exec StealthIndustrial », « ANVL_Arrow »).
 */
export function looksLikeWorkshopShipName(name: string | null | undefined): boolean {
  if (!name) return true;
  const value = name.trim();
  if (!value) return true;
  if (/^[A-Z]{2,5}_/.test(value)) return true;
  if (/\bCollector\s+(Civ|Military|Stealth|Mod|Indust|Grad)\b/i.test(value)) return true;
  if (/\bExec\s+(Military|Stealth)\b/i.test(value)) return true;
  if (/StealthIndustrial/i.test(value)) return true;
  if (/\bGrad\d+\b/i.test(value)) return true;
  return false;
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
    ship_matrix_id: number | null;
    manufacturer_name: string | null;
    manufacturer_code: string | null;
  }>(
    `SELECT s.uuid, s.class_name, s.name, s.ship_matrix_id, s.manufacturer_code, m.name AS manufacturer_name
       FROM game.ships s
       LEFT JOIN game.manufacturers m ON m.code = s.manufacturer_code
      WHERE s.env = $1
        AND (
          s.ship_matrix_id IS NULL
          OR s.name ~ '^[A-Z]{2,5}_'
          OR s.name ~* '(Collector\\s+(Civ|Military|Stealth|Mod|Indust|Grad)|Exec\\s+(Military|Stealth)|StealthIndustrial|\\bGrad\\d+\\b)'
        )`,
    [env],
  );

  let renamed = 0;
  for (const ship of rows) {
    const gameName = resolveGameShipName(loc, ship.class_name);
    if (!gameName) continue;
    const display = stripManufacturerPrefix(gameName, ship.manufacturer_name, ship.manufacturer_code);
    if (!display || display === ship.name) continue;
    // Ne pas remplacer un nom humain déjà propre par une autre clé de jeu.
    if (!looksLikeWorkshopShipName(ship.name) && ship.ship_matrix_id != null) continue;

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

const WORKSHOP_TOKEN_LABELS: Record<string, string> = {
  civ: 'Civilian',
  military: 'Military',
  stealth: 'Stealth',
  stealthindustrial: 'Stealth',
  indust: 'Industrial',
  mod: 'Mod',
};

/**
 * Dernier recours quand ni `global.ini` ni le wiki ne nomment un reste d'atelier :
 * dérive un libellé lisible du `class_name` (`MRAI_Pulse_Collector_Civ` → `Pulse (Civilian)`).
 */
export function humanizeWorkshopClassName(className: string, manufacturerCode?: string | null): string {
  let rest = className.trim();
  if (manufacturerCode && rest.toUpperCase().startsWith(`${manufacturerCode.toUpperCase()}_`)) {
    rest = rest.slice(manufacturerCode.length + 1);
  } else {
    rest = rest.replace(/^[A-Z]{2,5}_/, '');
  }

  const parts = rest.split('_').filter(Boolean);
  const variantRaw = parts[parts.length - 1] ?? '';
  const variant = WORKSHOP_TOKEN_LABELS[variantRaw.toLowerCase()] ?? (/^Grad\d+$/i.test(variantRaw) ? variantRaw : null);

  const coreParts = variant ? parts.slice(0, -1) : parts;
  const filtered = coreParts.filter((p) => !/^(Collector|Exec)$/i.test(p));
  const base = (filtered.length > 0 ? filtered : coreParts).join(' ').replace(/\s+/g, ' ').trim();
  if (!base) return className;
  return variant ? `${base} (${variant})` : base;
}

/**
 * Applique `humanizeWorkshopClassName` aux derniers restes d'atelier encore illisibles.
 * À exécuter après localisation + wiki.
 */
export async function nameRemainingWorkshopShips(conn: PoolClient, env: GameEnv, onProgress?: (msg: string) => void): Promise<number> {
  const { rows } = await conn.query<{
    uuid: string;
    class_name: string;
    name: string;
    manufacturer_code: string | null;
  }>(`SELECT uuid, class_name, name, manufacturer_code FROM game.ships WHERE env = $1`, [env]);

  const leftovers = rows.filter((s) => looksLikeWorkshopShipName(s.name));
  if (leftovers.length === 0) return 0;

  const occupied = new Map<string, number>();
  for (const row of rows) {
    if (leftovers.some((l) => l.uuid === row.uuid)) continue;
    occupied.set(row.name, (occupied.get(row.name) ?? 0) + 1);
  }

  let renamed = 0;
  for (const ship of leftovers) {
    const display = humanizeWorkshopClassName(ship.class_name, ship.manufacturer_code);
    if (!display || display === ship.name || looksLikeWorkshopShipName(display)) continue;
    if ((occupied.get(display) ?? 0) > 0) continue;
    occupied.set(display, 1);
    await conn.query('UPDATE game.ships SET name = $1 WHERE uuid = $2 AND env = $3', [display, ship.uuid, env]);
    logger.info(`Ship renamed from workshop humanizer: "${ship.name}" → "${display}"`, {
      module: 'ship-naming',
      className: ship.class_name,
    });
    renamed++;
  }

  if (renamed > 0) onProgress?.(`Humanized ${renamed} remaining workshop ship names from class_name`);
  return renamed;
}
