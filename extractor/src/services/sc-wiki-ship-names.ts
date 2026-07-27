/**
 * Troisième source de nommage : le wiki communautaire Star Citizen.
 *
 * Deuxième règle nommée de la couche de croisement, et la seule qui sorte du
 * périmètre CIG/RSI.
 *
 * ── Ce qu'elle comble ────────────────────────────────────────────────────────
 *
 * Après le Ship Matrix (nom commercial RSI) et `global.ini` (nom du jeu), il
 * reste des vaisseaux que personne d'officiel ne nomme : les variantes de
 * récompense les plus récentes. Ils tombent alors sur leur nomenclature
 * interne — « ATLS GEO Collector Grad01 », « Syulen Exec Stealth ».
 *
 * `api.star-citizen.wiki` les nomme, et surtout : **il est indexé sur notre
 * propre `class_name`**. Le rattachement est donc exact, sans correspondance de
 * noms — c'est précisément ce que la couche de croisement cherche à obtenir
 * partout ailleurs. Sa convention de libellé est également la nôtre :
 * constructeur retiré dans `name`, conservé dans `game_name`.
 *
 * ── Ce qu'elle refuse de faire ───────────────────────────────────────────────
 *
 * Elle n'écrase jamais un nom venu du jeu ou de RSI. Une source tierce, si utile
 * soit-elle, ne fait pas autorité contre la source primaire : elle ne parle que
 * là où celle-ci se tait.
 *
 * Un échec réseau n'interrompt pas l'extraction et ne modifie rien. Le pire cas
 * est l'état d'avant.
 */

import type { PoolClient } from 'pg';
import logger from '../logger.js';
import type { GameEnv } from '../module-registry.js';
import type { LocalizationService } from './localization-service.js';
import { resolveGameShipName, stripManufacturerPrefix } from './ship-naming.js';

const WIKI_BASE = 'https://api.star-citizen.wiki/api/v3/vehicles';
const REQUEST_TIMEOUT_MS = 8000;
/** Le wiki est un service bénévole : une requête à la fois, sans rafale. */
const DELAY_BETWEEN_REQUESTS_MS = 250;
/** Au-delà, on considère le wiki hors ligne plutôt que ces vaisseaux inconnus. */
const MAX_CONSECUTIVE_FAILURES = 3;

/** `MRAI_Guardian_QI_Collector_Indust` → `mrai-guardian-qi-collector-indust`. */
export function classNameToWikiSlug(className: string): string {
  return className.toLowerCase().replace(/_/g, '-');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Interroge le wiki pour un `class_name`. Renvoie null sur 404, erreur réseau,
 * réponse inattendue, ou si le wiki renvoie un autre vaisseau que celui demandé.
 */
export async function fetchWikiShipName(className: string): Promise<string | null> {
  const url = `${WIKI_BASE}/${classNameToWikiSlug(className)}`;
  let payload: unknown;
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    payload = await res.json();
  } catch {
    return null;
  }

  const data = (payload as { data?: Record<string, unknown> })?.data ?? (payload as Record<string, unknown>);
  if (!data || typeof data !== 'object') return null;

  // Le wiki est indexé sur le class_name : si celui qu'il renvoie diffère, le
  // slug a mené ailleurs et la réponse ne concerne pas notre vaisseau.
  const returned = data.class_name;
  if (typeof returned === 'string' && returned.toLowerCase() !== className.toLowerCase()) return null;

  const name = data.name ?? data.game_name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

/**
 * Nomme les vaisseaux que ni RSI ni le jeu ne nomment.
 *
 * À exécuter après `nameShipsMissingFromShipMatrix` : les vaisseaux que
 * `global.ini` couvre sont ignorés ici, la source primaire ayant déjà tranché.
 */
export async function nameShipsFromCommunityWiki(
  conn: PoolClient,
  env: GameEnv,
  loc: LocalizationService,
  onProgress?: (msg: string) => void,
): Promise<number> {
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

  const orphans = rows.filter((s) => !(loc.isLoaded && resolveGameShipName(loc, s.class_name)));
  if (orphans.length === 0) return 0;

  onProgress?.(`Asking the community wiki for ${orphans.length} ship names the game does not provide…`);

  const proposals: Array<{ ship: (typeof orphans)[number]; display: string }> = [];
  let unreachable = 0;
  let consecutiveFailures = 0;

  for (const ship of orphans) {
    // Un wiki hors ligne coûterait sinon un délai d'attente par vaisseau, soit
    // plusieurs minutes ajoutées à l'extraction pour ne rien obtenir. Trois
    // échecs d'affilée suffisent à conclure.
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      onProgress?.('Community wiki unreachable — giving up, ship names left untouched');
      logger.warn('Community wiki unreachable after consecutive failures', {
        module: 'sc-wiki',
        attempted: proposals.length + unreachable,
      });
      break;
    }

    const wikiName = await fetchWikiShipName(ship.class_name);
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
    if (!wikiName) {
      unreachable++;
      consecutiveFailures++;
      continue;
    }
    consecutiveFailures = 0;
    const display = stripManufacturerPrefix(wikiName, ship.manufacturer_name, ship.manufacturer_code);
    if (!display || display === ship.name) continue;
    proposals.push({ ship, display });
  }

  const { applied, collided } = await applyWithoutCollisions(conn, env, proposals);

  // Chaque catégorie est comptée séparément : sans cela, un wiki injoignable
  // produirait exactement la même trace qu'un wiki qui ne connaît aucun de ces
  // vaisseaux, ou qu'un lot entièrement rejeté pour cause de doublon.
  onProgress?.(
    `Community wiki: ${applied} named, ${collided} rejected as duplicates, ${unreachable} unknown or unreachable, out of ${orphans.length}`,
  );
  return applied;
}

export interface RenameProposal {
  uuid: string;
  className: string;
  currentName: string;
  proposedName: string;
}

/**
 * Sépare les renommages applicables de ceux qui créeraient un homonyme.
 *
 * Le wiki donne le même nom aux variantes Military et Stealth d'un même
 * vaisseau : `DRAK_Corsair_Exec_Military` et `DRAK_Corsair_Exec_StealthIndustrial`
 * y sont tous deux « Corsair PYAM Exec ». Les appliquer tels quels rendrait deux
 * vaisseaux distincts indiscernables dans une liste. Un nom laid qui identifie
 * vaut mieux qu'un beau nom qui confond.
 *
 * Pure et testable à part, parce que c'est la logique subtile : il faut compter
 * ensemble les noms proposés **et** ceux déjà portés par les vaisseaux qu'on ne
 * renomme pas, sans retenir celui qu'une proposition libère.
 */
export function partitionByCollision(
  proposals: RenameProposal[],
  existingNames: Array<{ uuid: string; name: string }>,
): { applicable: RenameProposal[]; rejected: RenameProposal[] } {
  const beingRenamed = new Set(proposals.map((p) => p.uuid));
  const occurrences = new Map<string, number>();

  // Le nom actuel d'un vaisseau qu'on renomme se libère : ne pas le compter.
  for (const row of existingNames) {
    if (beingRenamed.has(row.uuid)) continue;
    occurrences.set(row.name, (occurrences.get(row.name) ?? 0) + 1);
  }
  for (const p of proposals) {
    occurrences.set(p.proposedName, (occurrences.get(p.proposedName) ?? 0) + 1);
  }

  const applicable: RenameProposal[] = [];
  const rejected: RenameProposal[] = [];
  for (const p of proposals) {
    if ((occurrences.get(p.proposedName) ?? 0) > 1) rejected.push(p);
    else applicable.push(p);
  }
  return { applicable, rejected };
}

async function applyWithoutCollisions(
  conn: PoolClient,
  env: GameEnv,
  proposals: Array<{ ship: { uuid: string; class_name: string; name: string }; display: string }>,
): Promise<{ applied: number; collided: number }> {
  const { rows: existing } = await conn.query<{ uuid: string; name: string }>('SELECT uuid, name FROM game.ships WHERE env = $1', [env]);

  const { applicable, rejected } = partitionByCollision(
    proposals.map((p) => ({
      uuid: p.ship.uuid,
      className: p.ship.class_name,
      currentName: p.ship.name,
      proposedName: p.display,
    })),
    existing,
  );

  for (const p of rejected) {
    logger.warn(`Community wiki name rejected — would collide: "${p.currentName}" → "${p.proposedName}"`, {
      module: 'sc-wiki',
      className: p.className,
    });
  }
  for (const p of applicable) {
    await conn.query('UPDATE game.ships SET name = $1 WHERE uuid = $2 AND env = $3', [p.proposedName, p.uuid, env]);
    logger.info(`Ship renamed from community wiki: "${p.currentName}" → "${p.proposedName}"`, {
      module: 'sc-wiki',
      className: p.className,
    });
  }
  return { applied: applicable.length, collided: rejected.length };
}
