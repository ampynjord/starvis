/**
 * Une boutique telle que l'API la sert.
 *
 * `inventory_count` vient d'une sous-requête corrélée, `display_shop_type` d'une
 * mise en forme faite en JS — ni l'un ni l'autre n'est une colonne.
 */
export interface PublicShop {
  id: number;
  name: string;
  class_name: string;
  shop_type: string;
  location_uuid: string | null;
  location: string | null;
  planet_moon: string | null;
  city: string | null;
  system: string | null;
  canonical_shop_key: string;
  loc_key: string | null;
  franchise_slug: string;
  location_slug: string;
  franchise_loc_key: string | null;
  p4k_path: string;
  /** Compté par sous-requête sur l'inventaire. */
  inventory_count: number;
  /** Libellé mis en forme pour l'affichage. */
  display_shop_type: string;
}
