/**
 * L'enveloppe unique de `/api/v2`.
 *
 * La v1 en sert quatre selon la ressource : `/ships` ne porte aucune pagination,
 * `/shops` aucun `meta`, `/components` les deux plus un `count` redondant avec
 * `total`. Un consommateur doit donc traiter chaque route à part, ce qui est
 * exactement ce qu'une API ne devrait pas demander.
 *
 * ── Ce que la v2 retire ──────────────────────────────────────────────────────
 *
 * `success`. Le code HTTP le dit déjà, et le porter deux fois autorise les deux
 * à diverger — un `200` avec `success: false` n'a aucun sens et rien
 * n'empêchait de l'écrire. Les erreurs restent en RFC 7807, comme en v1.
 *
 * ── Ce que la v2 ajoute ──────────────────────────────────────────────────────
 *
 * `data_version` : l'empreinte de l'extraction qui a produit ces valeurs. Un
 * consommateur sait ainsi s'il lit la même donnée qu'à son appel précédent, ce
 * que ni la date ni le contenu ne lui disaient.
 */
import type { Response } from 'express';
import { getDataVersion } from '../../services/redis.js';

export interface PageInfo {
  number: number;
  size: number;
  total: number;
  pages: number;
}

export interface Envelope<T> {
  data: T;
  meta: {
    env: string;
    /** Empreinte de la dernière extraction connue, tronquée à douze caractères. */
    data_version: string;
    generated_at: string;
  };
  page?: PageInfo;
}

function meta(env: string): Envelope<never>['meta'] {
  return { env, data_version: getDataVersion(), generated_at: new Date().toISOString() };
}

export function sendOne<T>(res: Response, env: string, data: T): void {
  res.json({ data, meta: meta(env) } satisfies Envelope<T>);
}

export function sendPage<T>(res: Response, env: string, data: T[], page: number, limit: number, total: number): void {
  res.json({
    data,
    meta: meta(env),
    // `pages` vaut au moins 1 : une liste vide reste une page, et rendre 0
    // obligerait l'appelant à traiter le cas séparément.
    page: { number: page, size: limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  } satisfies Envelope<T[]>);
}

/** L'absence n'est pas une erreur applicative : elle se dit par le code HTTP. */
export function sendMissing(res: Response, what: string): void {
  res.status(404).json({ type: 'about:blank', title: 'Not Found', status: 404, detail: `${what} not found` });
}
