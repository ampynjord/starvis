/**
 * Un vaisseau tel que l'API le sert.
 *
 * C'est le contrat de `/api/v1/ships`, écrit une fois. Les noms sont en
 * `snake_case` parce que c'est ce que les consommateurs reçoivent — l'IHM comme
 * les tiers.
 *
 * Les champs reprennent exactement les 66 colonnes de `SHIP_SELECT_COLUMNS`,
 * dans leur ordre. Les deux branches de l'union — vaisseaux du jeu et
 * vaisseaux-concepts — exposent la même forme ; `ship-select-shape.test.ts` le
 * garde, parce que PostgreSQL apparie un `UNION` par position et qu'un écart ne
 * se verrait qu'en production.
 *
 * Les types viennent des déclarations que l'IHM maintenait de son côté ;
 * confrontées aux colonnes réellement servies, elles les couvraient toutes. À
 * terme l'IHM importe celui-ci au lieu d'entretenir le sien — c'est l'objet de
 * la décision D4, « types publiés ».
 */
export interface PublicShip {
  // Identity
  uuid: string;
  class_name: string;
  name: string;
  manufacturer_code: string | null;
  manufacturer_name: string | null;
  // Role & career
  career: string | null;
  role: string | null;
  // Physical
  mass: number | null;
  total_hp: number | null;
  size_x: number | null;
  size_y: number | null;
  size_z: number | null;
  // Flight
  scm_speed: number | null;
  max_speed: number | null;
  boost_speed_forward: number | null;
  boost_speed_backward: number | null;
  pitch_max: number | null;
  yaw_max: number | null;
  roll_max: number | null;
  boost_ramp_up: number | null;
  boost_ramp_down: number | null;
  // Resources
  hydrogen_fuel_capacity: number | null;
  quantum_fuel_capacity: number | null;
  cargo_capacity: number | null;
  crew_size: number | null;
  shield_hp: number | null;
  shield_regen: number | null;
  shield_regen_delay: number | null;
  shield_down_delay: number | null;
  // Combat
  missile_damage_total: number | null;
  weapon_damage_total: number | null;
  // Armor & signals
  armor_physical: number | null;
  armor_energy: number | null;
  armor_distortion: number | null;
  armor_hp: number | null;
  armor_phys_resist: number | null;
  armor_energy_resist: number | null;
  armor_signal_ir: number | null;
  armor_signal_em: number | null;
  armor_signal_cs: number | null;
  fuse_penetration: number | null;
  component_penetration: number | null;
  // Cross sections
  cross_section_x: number | null;
  cross_section_y: number | null;
  cross_section_z: number | null;
  // Ship Matrix / media
  ship_matrix_id: number | null;
  thumbnail: string | null;
  thumbnail_large: string | null;
  production_status: string | null;
  sm_description: string | null;
  store_url: string | null;
  min_crew: number | null;
  max_crew: number | null;
  // 3D model
  ctm_url: string | null;
  // Meta
  vehicle_category: string | null;
  insurance_claim_time: number | null;
  insurance_expedite_cost: number | null;
  short_name: string | null;
  variant_type: string | null;
  min_purchase_price: number | null;
  min_rental_price_1d: number | null;
  min_rental_price_3d: number | null;
  min_rental_price_7d: number | null;
  min_rental_price_30d: number | null;
  purchase_location_count: number | null;
  rental_location_count: number | null;
  /** Ajouté par l'union : distingue un concept RSI d'un vaisseau du jeu. */
  is_concept_only?: boolean;
  /** Forme standard de l'identifiant, ajoutée par `stripInternal`. */
  sc_uuid?: string;
}

/**
 * Ce que la fiche d'un vaisseau ajoute à la liste.
 *
 * `game_data` ne figure pas dans `SHIP_SELECT_COLUMNS` : la requête de détail
 * l'ajoute explicitement. Un vaisseau-concept n'en a pas, d'où l'optionalité.
 *
 * La requête de détail sélectionne aussi `sm_length`, `sm_beam` et `sm_height`,
 * absents ici à dessein : ce sont des colonnes de travail, servant à compléter
 * les dimensions manquantes, et supprimées de l'objet avant qu'il ne sorte. Les
 * déclarer laisserait croire qu'un consommateur peut compter dessus.
 */
export interface PublicShipDetail extends PublicShip {
  game_data?: Record<string, unknown> | string | null;
  /** Attachée par la route de détail depuis le Ship Matrix. */
  gallery?: unknown[];
  /** Relations optionnelles, attachées seulement si `include` les demande. */
  manufacturer?: unknown;
  paints?: unknown;
  similar?: unknown;
}
