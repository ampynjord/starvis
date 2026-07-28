/**
 * Un élément minier tel que l'API le sert.
 *
 * Les trois moyennes sont calculées par la requête sur les compositions qui
 * contiennent l'élément ; elles sont nulles quand aucune ne le contient.
 */
export interface PublicMiningElement {
  uuid: string;
  class_name: string;
  name: string;
  commodity_uuid: string;
  instability: number;
  resistance: number;
  optimal_window_midpoint: number;
  optimal_window_thinness: number;
  optimal_window_midpoint_rand: number;
  explosion_multiplier: number;
  cluster_factor: number;
  p4k_path: string;
  /** Nombre de compositions contenant l'élément. */
  rocks_containing: number;
  avg_probability_pct: number | null;
  avg_min_pct: number | null;
  avg_max_pct: number | null;
}
