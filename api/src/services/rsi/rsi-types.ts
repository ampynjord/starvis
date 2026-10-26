/**
 * Contrats publics de `RsiWebsiteService` — ce que `/api/v1` galactapedia,
 * comm-links et starmap servent réellement.
 *
 * Déclarés en zod pour rejoindre le registre de schémas ; les types exportés
 * typent les retours SQL sans sérialisation ni changement de forme.
 */
import { z } from 'zod';

const jsonUnknown = z.unknown().nullable();

/** Entrée Galactapedia telle que la liste la sélectionne. */
export const PublicGalactapediaEntry = z
  .object({
    id: z.union([z.string(), z.number()]),
    slug: z.string().nullable().optional(),
    title: z.string(),
    excerpt: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
    template: z.string().nullable().optional(),
    categories: jsonUnknown.optional(),
    tags: jsonUnknown.optional(),
    categories_count: z.union([z.number(), z.bigint()]).nullable().optional(),
    tags_count: z.union([z.number(), z.bigint()]).nullable().optional(),
    related_articles_count: z.union([z.number(), z.bigint()]).nullable().optional(),
    thumbnail_url: z.string().nullable().optional(),
    rsi_url: z.string().nullable().optional(),
    api_url: z.string().nullable().optional(),
    web_url: z.string().nullable().optional(),
    source_created_at: z.union([z.string(), z.date()]).nullable().optional(),
    updated_at: z.union([z.string(), z.date()]).nullable().optional(),
    /** Présent sur la fiche seule (`SELECT *`). */
    content: z.string().nullable().optional(),
  })
  .passthrough();
export type PublicGalactapediaEntry = z.infer<typeof PublicGalactapediaEntry>;

/** Comm-link tel que la liste le sélectionne. */
export const PublicCommLink = z
  .object({
    id: z.union([z.string(), z.number()]),
    rsi_id: z.union([z.string(), z.number()]).nullable().optional(),
    slug: z.string().nullable().optional(),
    title: z.string(),
    excerpt: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    source_category: z.string().nullable().optional(),
    channel: z.string().nullable().optional(),
    series: z.string().nullable().optional(),
    thumbnail_url: z.string().nullable().optional(),
    rsi_url: z.string().nullable().optional(),
    api_url: z.string().nullable().optional(),
    api_public_url: z.string().nullable().optional(),
    images_count: z.union([z.number(), z.bigint()]).nullable().optional(),
    links_count: z.union([z.number(), z.bigint()]).nullable().optional(),
    comment_count: z.union([z.number(), z.bigint()]).nullable().optional(),
    published_at: z.union([z.string(), z.date()]).nullable().optional(),
    content: z.string().nullable().optional(),
  })
  .passthrough();
export type PublicCommLink = z.infer<typeof PublicCommLink>;

/** Vignette / image de comm-link (liste, aléatoire, détail). */
export const PublicCommLinkImage = z
  .object({
    id: z.union([z.string(), z.number()]),
    rsi_id: z.union([z.string(), z.number()]).nullable().optional(),
    slug: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    channel: z.string().nullable().optional(),
    series: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    thumbnail_url: z.string().nullable().optional(),
    rsi_url: z.string().nullable().optional(),
    api_url: z.string().nullable().optional(),
    api_public_url: z.string().nullable().optional(),
    images_count: z.union([z.number(), z.bigint()]).nullable().optional(),
    published_at: z.union([z.string(), z.date()]).nullable().optional(),
  })
  .passthrough();
export type PublicCommLinkImage = z.infer<typeof PublicCommLinkImage>;

const PublicP4kLocationRef = z
  .object({
    uuid: z.string().optional(),
    env: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    system_code: z.string().nullable().optional(),
    coordinates: jsonUnknown.optional(),
    p4k_path: z.string().optional(),
    parent_uuid: z.string().nullable().optional(),
    is_scannable: z.boolean().optional(),
  })
  .passthrough()
  .nullable();

/** Lieu / système starmap RSI (liste). */
export const PublicStarmapLocation = z
  .object({
    id: z.union([z.string(), z.number()]),
    rsi_id: z.union([z.string(), z.number()]).nullable().optional(),
    name: z.string(),
    type: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    star_type: z.string().nullable().optional(),
    system_code: z.string().nullable().optional(),
    system_name: z.string().nullable().optional(),
    parent_id: z.union([z.string(), z.number()]).nullable().optional(),
    faction_name: z.string().nullable().optional(),
    affiliations: jsonUnknown.optional(),
    thumbnail: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    web_url: z.string().nullable().optional(),
    coordinates: jsonUnknown.optional(),
    aggregated: jsonUnknown.optional(),
    size: z.union([z.number(), z.string()]).nullable().optional(),
    population: z.union([z.number(), z.string()]).nullable().optional(),
    economy: z.union([z.number(), z.string()]).nullable().optional(),
    danger: z.union([z.number(), z.string()]).nullable().optional(),
    frost_line: z.union([z.number(), z.string()]).nullable().optional(),
    habitable_zone_inner: z.union([z.number(), z.string()]).nullable().optional(),
    habitable_zone_outer: z.union([z.number(), z.string()]).nullable().optional(),
    jump_points: jsonUnknown.optional(),
    source_updated_at: z.union([z.string(), z.date()]).nullable().optional(),
    synced_at: z.union([z.string(), z.date()]).nullable().optional(),
    p4k_location: PublicP4kLocationRef.optional(),
    children: jsonUnknown.optional(),
  })
  .passthrough();
export type PublicStarmapLocation = z.infer<typeof PublicStarmapLocation>;

/** Position starmap enrichie (carte). */
export const PublicStarmapPosition = PublicStarmapLocation.extend({
  parent_db_id: z.union([z.string(), z.number()]).nullable().optional(),
  designation: z.string().nullable().optional(),
  orbit_period: z.string().nullable().optional(),
  axial_tilt: z.string().nullable().optional(),
  appearance: z.string().nullable().optional(),
  texture_url: z.string().nullable().optional(),
  subtype: z.string().nullable().optional(),
  thumbnail_data: jsonUnknown.optional(),
  assets: jsonUnknown.optional(),
});
export type PublicStarmapPosition = z.infer<typeof PublicStarmapPosition>;

export const PublicJumpPoint = z
  .object({
    id: z.union([z.string(), z.number()]),
    rsi_id: z.union([z.string(), z.number()]).nullable().optional(),
    name: z.string().nullable().optional(),
    system_code: z.string().nullable().optional(),
    system_name: z.string().nullable().optional(),
    jump_points: jsonUnknown.optional(),
    web_url: z.string().nullable().optional(),
  })
  .passthrough();
export type PublicJumpPoint = z.infer<typeof PublicJumpPoint>;

export const PublicStarmapFilterOption = z
  .object({
    value: z.unknown(),
    label: z.unknown(),
    count: z.union([z.number(), z.bigint(), z.string()]).optional(),
  })
  .passthrough();
export type PublicStarmapFilterOption = z.infer<typeof PublicStarmapFilterOption>;
