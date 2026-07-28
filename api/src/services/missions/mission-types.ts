/**
 * Une mission telle que l'API la sert.
 *
 * ── Sept champs ne sont jamais renseignés ────────────────────────────────────
 *
 * Vérifié sur les 473 missions de la base : `location_system`, `location_planet`,
 * `location_name`, `required_reputation`, `reputation_reward`, `base_xp` et
 * `blueprint_reward_uuid` sont nuls **partout**. `description` ne l'est pas tout
 * à fait : 15 missions sur 473 en portent une, soit 3 %.
 *
 * Ces colonnes existent au schéma et sortent dans le contrat, mais l'extraction
 * ne les remplit pas. Elles sont déclarées ici avec le type du modèle — les
 * marquer autrement laisserait croire qu'elles n'existent pas, alors que le
 * problème est qu'elles sont vides.
 *
 * L'audit de vérité ne couvrait pas les missions ; c'est ce qui a laissé ce trou
 * invisible.
 */
export interface PublicMission {
  uuid: string;
  class_name: string;
  title: string;
  /** Renseignée pour 15 missions sur 473. */
  description: string | null;
  mission_type: string;
  can_be_shared: boolean;
  only_owner_complete: boolean;
  is_legal: boolean;
  completion_time_s: number | null;
  reward_min: number | null;
  reward_max: number | null;
  reward_currency: string;
  faction: string | null;
  mission_giver: string | null;
  /** Jamais renseignée : l'extraction ne la remplit pas. */
  location_system: string | null;
  /** Jamais renseignée. */
  location_planet: string | null;
  /** Jamais renseignée. */
  location_name: string | null;
  danger_level: number | null;
  /** Jamais renseignée. */
  required_reputation: number | null;
  /** Jamais renseignée. */
  reputation_reward: number | null;
  /** Jamais renseignée. */
  base_xp: number | null;
  category: string;
  is_unique: boolean;
  has_blueprint_reward: boolean;
  /** Jamais renseignée. */
  blueprint_reward_uuid: string | null;
  buy_in_amount: number | null;
  not_for_release: boolean;
  work_in_progress: boolean;
  p4k_path: string;
  raw_json: unknown;
  blueprint_reward_count: number;
  display_mission_type: string;
  display_category: string;
}
