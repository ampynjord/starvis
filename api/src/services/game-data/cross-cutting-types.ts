/**
 * Contrats publics des méthodes transversales encore en SQL brut dans
 * `GameDataService` (changelog, versions, traductions, RSI cache…).
 *
 * Les sous-services (ships, commodities…) ont déjà leur `Public*`. Ici on
 * déclare ce qui restait typé `Row`.
 */
import { z } from 'zod';

export const PublicTranslation = z
  .object({
    uuid: z.string(),
    env: z.string(),
    domain: z.unknown().nullable().optional(),
    class_name: z.string().nullable().optional(),
    name_en: z.string().nullable().optional(),
    name_fr: z.string().nullable().optional(),
    description_en: z.string().nullable().optional(),
    description_fr: z.string().nullable().optional(),
    extracted_at: z.union([z.string(), z.date()]).nullable().optional(),
  })
  .passthrough();
export type PublicTranslation = z.infer<typeof PublicTranslation>;

export const PublicChangelogEntry = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    extraction_id: z.union([z.string(), z.number()]).optional(),
    entity_type: z.string().nullable().optional(),
    entity_uuid: z.string().nullable().optional(),
    entity_name: z.string().nullable().optional(),
    change_type: z.string().nullable().optional(),
    field_name: z.string().nullable().optional(),
    old_value: z.unknown().optional(),
    new_value: z.unknown().optional(),
    created_at: z.union([z.string(), z.date()]).nullable().optional(),
    game_version: z.string().nullable().optional(),
    game_env: z.string().nullable().optional(),
    extraction_date: z.union([z.string(), z.date()]).nullable().optional(),
  })
  .passthrough();
export type PublicChangelogEntry = z.infer<typeof PublicChangelogEntry>;

export const PublicGameVersion = z
  .object({
    game_version: z.string().nullable().optional(),
    game_env: z.string().nullable().optional(),
    extracted_at: z.union([z.string(), z.date()]).nullable().optional(),
    id: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();
export type PublicGameVersion = z.infer<typeof PublicGameVersion>;

export const PublicExtractionLogEntry = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    game_version: z.string().nullable().optional(),
    game_env: z.string().nullable().optional(),
    extracted_at: z.union([z.string(), z.date()]).nullable().optional(),
    status: z.string().nullable().optional(),
  })
  .passthrough();
export type PublicExtractionLogEntry = z.infer<typeof PublicExtractionLogEntry>;

export const PublicRsiRoadmapItem = z
  .object({
    release_key: z.unknown().optional(),
    release_name: z.unknown().optional(),
    synced_at: z.union([z.string(), z.date()]).nullable().optional(),
  })
  .passthrough();
export type PublicRsiRoadmapItem = z.infer<typeof PublicRsiRoadmapItem>;

export const PublicUnifiedSearchHit = z
  .object({
    uuid: z.string().optional(),
    name: z.string().nullable().optional(),
    class_name: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
  })
  .passthrough();
export type PublicUnifiedSearchHit = z.infer<typeof PublicUnifiedSearchHit>;
