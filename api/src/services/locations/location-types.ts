/**
 * Un lieu tel que l'API le sert.
 *
 * Forme déduite de ce que l'API rend réellement, sur 200 lignes. `coordinates`
 * n'apparaît jamais renseignée dans cet échantillon ; son type vient du modèle,
 * où la colonne est un `Json?`.
 */
import type { PoliticalAffiliation } from '../../data/location-affiliations.js';

export interface PublicLocation {
  uuid: string;
  class_name: string;
  name: string;
  type: string;
  system_code: string | null;
  parent_uuid: string | null;
  rsi_starmap_location_id: number | null;
  starmap_match_method: string | null;
  starmap_match_score: number | null;
  starmap_match_confidence: string | null;
  loc_key: string | null;
  coordinates: unknown;
  p4k_path: string;
  is_scannable: boolean;
  hide_in_starmap: boolean;
  rsi_starmap: unknown;
  /** Déduite du `class_name` par une table d'appartenances, pas une colonne. */
  affiliation: PoliticalAffiliation | null;
  /** Forme standard de l'identifiant, ajoutée par `stripInternal`. */
  sc_uuid?: string;
}
