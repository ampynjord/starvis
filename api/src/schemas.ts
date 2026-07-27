/**
 * STARVIS - Zod schemas & pure helpers
 *
 * Extracted to a standalone module so tests can import them
 * without triggering side-effects (DB config, logger, etc.).
 */
import { z } from 'zod';

// ── Query param coercers ──────────────────────────────────

/** Coerce Express query param (string | string[] | undefined) → string | undefined */
export const qStr = z.preprocess((v) => (Array.isArray(v) ? v[0] : v) || undefined, z.string().max(200).optional());

/**
 * Coerce env query param → validated GameEnv string, defaults to 'live'.
 *
 * Pas de `.catch()` ici : un `env` invalide doit produire un 400, pas retomber
 * silencieusement sur 'live'. Une faute de frappe renverrait sinon les données
 * LIVE à un client qui a demandé PTU — une réponse fausse est pire qu'une erreur.
 */
export const qEnv = z.preprocess((v) => (Array.isArray(v) ? v[0] : v) || 'live', z.enum(['live', 'ptu', 'custom']));

export const qInt = (def: number, max?: number) =>
  z
    .preprocess(
      (v) => {
        const s = Array.isArray(v) ? v[0] : v;
        return s === undefined || s === '' ? def : s;
      },
      // Le plancher vaut 1 pour les paramètres 1-indexés (page, limit) mais suit la
      // valeur par défaut quand celle-ci est plus basse : `offset` démarre à 0 et
      // doit rester acceptable. Une valeur par défaut qui échouerait sa propre
      // validation est un piège — c'est exactement ce que masquait le `.catch()`.
      //
      // Une valeur non numérique est rejetée (400) : retomber sur la valeur par
      // défaut masquerait une erreur d'appel. Un dépassement du plafond est en
      // revanche ramené au plafond — politique de service, pas faute du client.
      z.coerce
        .number()
        .int()
        .min(Math.min(1, def))
        .transform((n) => (max ? Math.min(n, max) : n)),
      // Le plafond est appliqué par un `transform`, que la conversion en JSON
      // Schema ne peut pas voir : sans cette métadonnée, la documentation générée
      // annoncerait un maximum de 2^53 au lieu de la vraie limite de service.
    )
    .meta({ default: def, ...(max ? { maximum: max } : {}) });

// ── Route schemas ─────────────────────────────────────────

export const ShipQuery = z
  .object({
    env: qEnv,
    manufacturer: qStr,
    role: qStr,
    career: qStr,
    status: qStr,
    vehicle_category: qStr,
    variant_type: qStr,
    search: qStr,
    sort: qStr,
    order: qStr,
    page: qInt(1),
    limit: qInt(50, 200),
    format: qStr,
    view: qStr,
    /** Comma-separated optional relations: manufacturer,paints,matrix,variants */
    include: qStr,
  })
  .passthrough();

export const ComponentQuery = z
  .object({
    env: qEnv,
    type: qStr,
    types: qStr,
    sub_type: qStr,
    sub_types: qStr,
    weapon_damage_type: qStr,
    cm_type: qStr,
    size: qStr,
    grade: qStr,
    component_class: qStr,
    is_bespoke: qStr,
    min_size: qStr,
    max_size: qStr,
    manufacturer: qStr,
    search: qStr,
    sort: qStr,
    order: qStr,
    page: qInt(1),
    limit: qInt(50, 200),
    format: qStr,
  })
  .passthrough();

export const ShopQuery = z
  .object({
    env: qEnv,
    search: qStr,
    location: qStr,
    type: qStr,
    shop_type: qStr,
    page: qInt(1),
    limit: qInt(20, 100),
    format: qStr,
  })
  .passthrough();

export const ChangelogQuery = z
  .object({
    env: qEnv,
    limit: qStr,
    offset: qStr,
    entity_type: qStr,
    change_type: qStr,
    markers_only: qStr,
  })
  .passthrough();

export const LoadoutBody = z.object({
  shipUuid: z.string().min(1, 'shipUuid is required'),
  swaps: z
    .array(
      z
        .object({
          portId: z.number().int().positive().optional(),
          portName: z.string().min(1).optional(),
          componentUuid: z.string().min(1, 'componentUuid is required'),
        })
        .refine((s) => s.portId || s.portName, { message: 'portId or portName required' }),
    )
    .default([]),
  modules: z
    .array(z.object({ slotName: z.string().min(1), moduleClassName: z.string().min(1) }))
    .optional()
    .default([]),
});

export const SearchQuery = z.object({ env: qEnv, search: qStr, format: qStr }).passthrough();

export const PaintQuery = z
  .object({
    env: qEnv,
    search: qStr,
    ship_uuid: qStr,
    page: qInt(1),
    limit: qInt(50, 5000),
    format: qStr,
  })
  .passthrough();

export const ItemQuery = z
  .object({
    env: qEnv,
    type: qStr,
    types: qStr,
    sub_type: qStr,
    sub_types: qStr,
    exclude_sub_types: qStr,
    item_group: qStr,
    manufacturer: qStr,
    search: qStr,
    sort: qStr,
    order: qStr,
    page: qInt(1),
    limit: qInt(50, 200),
    format: qStr,
    view: qStr,
    /** Comma-separated optional relations: manufacturer */
    include: qStr,
  })
  .passthrough();

export const GameVersionsQuery = z
  .object({
    env: qStr,
    limit: qInt(20, 100),
    offset: qInt(0),
  })
  .passthrough();

export const CommodityQuery = z
  .object({
    env: qEnv,
    type: qStr,
    types: qStr,
    category: qStr,
    search: qStr,
    sort: qStr,
    order: qStr,
    page: qInt(1),
    limit: qInt(50, 200),
    format: qStr,
  })
  .passthrough();

// ── Pure helpers ──────────────────────────────────────────

export function arrayToCsv(data: Record<string, unknown>[]): string {
  if (!data.length) return '';
  const headers = Object.keys(data[0]);
  const lines = [headers.join(',')];
  for (const row of data) {
    lines.push(
      headers
        .map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(','),
    );
  }
  return lines.join('\n');
}
