/**
 * Un objet tel que l'API le sert.
 *
 * Les requêtes d'objets font `SELECT i.*` : la forme suit donc les colonnes de
 * la table, en `snake_case`, plus ce que la jointure et la normalisation
 * ajoutent.
 *
 * **Les colonnes `Decimal` sortent en chaîne, pas en nombre.** `mass` vaut
 * `"0"`, `weapon_dps` vaut `"0.675"` — c'est ce que rend le pilote pour un
 * `numeric`, et c'est ce que les consommateurs reçoivent depuis toujours. Les
 * déclarer `number` serait une erreur de type qui ne se verrait qu'à
 * l'exécution, chez un tiers qui ferait une addition. Les colonnes `Int`, elles,
 * sortent bien en nombre.
 */
export interface PublicItem {
  uuid: string;
  env: string;
  class_name: string;
  name: string;
  type: string;
  sub_type: string | null;
  size: number | null;
  grade: string | null;
  manufacturer_code: string | null;
  /** `Decimal` : chaîne. */
  mass: string | null;
  hp: number | null;
  /** `Decimal` : chaîne. */
  weapon_damage: string | null;
  weapon_damage_type: string | null;
  /** `Decimal` : chaîne. */
  weapon_fire_rate: string | null;
  /** `Decimal` : chaîne. */
  weapon_range: string | null;
  /** `Decimal` : chaîne. */
  weapon_speed: string | null;
  weapon_ammo_count: number | null;
  /** `Decimal` : chaîne. */
  weapon_dps: string | null;
  /** `Decimal` : chaîne. */
  armor_damage_reduction: string | null;
  /** `Decimal` : chaîne. */
  armor_temp_min: string | null;
  /** `Decimal` : chaîne. */
  armor_temp_max: string | null;
  data_json: unknown;
  created_at: Date;
  updated_at: Date;
  /** Ajouté par la jointure sur les constructeurs. */
  manufacturer_name: string | null;
  /** Forme standard de l'identifiant, ajoutée par `stripInternal`. */
  sc_uuid?: string;
  /** Libellé nettoyé pour l'affichage, ajouté par `normalizeItemRow`. */
  display_name?: string;
  /** Relation optionnelle, attachée seulement si `include=manufacturer`. */
  manufacturer?: unknown;
}

/**
 * Ce que la liste ajoute à la fiche : les agrégats de marché.
 *
 * Ils viennent d'une jointure absente de la requête de détail — d'où deux types
 * plutôt qu'un seul avec des champs optionnels partout, qui laisserait croire
 * qu'une fiche peut les porter.
 */
export interface PublicItemListed extends PublicItem {
  /** `Decimal` : chaîne. */
  min_purchase_price: string | null;
  /** `Decimal` : chaîne. */
  min_rental_price_1d: string | null;
  /** `Decimal` : chaîne. */
  min_rental_price_3d: string | null;
  /** `Decimal` : chaîne. */
  min_rental_price_7d: string | null;
  /** `Decimal` : chaîne. */
  min_rental_price_30d: string | null;
  purchase_location_count: number;
  rental_location_count: number;
}
