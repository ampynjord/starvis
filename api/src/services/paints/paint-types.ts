/**
 * Une livrée telle que l'API la sert.
 *
 * Les cinq champs de prix sont nuls sur l'ensemble des 200 lignes observées : les
 * livrées n'ont pas de données de marché aujourd'hui. Leur type vient donc du
 * modèle — des `Decimal`, donc des chaînes, comme partout ailleurs dans cette
 * API.
 */
export interface PublicPaint {
  id: number;
  ship_uuid: string;
  paint_class_name: string;
  paint_name: string;
  paint_uuid: string;
  ship_name: string;
  ship_class_name: string;
  manufacturer_name: string;
  manufacturer_code: string;
  /** `Decimal` : chaîne. Toujours nul en pratique. */
  min_purchase_price: string | null;
  /** `Decimal` : chaîne. Toujours nul en pratique. */
  min_rental_price_1d: string | null;
  /** `Decimal` : chaîne. Toujours nul en pratique. */
  min_rental_price_3d: string | null;
  /** `Decimal` : chaîne. Toujours nul en pratique. */
  min_rental_price_7d: string | null;
  /** `Decimal` : chaîne. Toujours nul en pratique. */
  min_rental_price_30d: string | null;
  purchase_location_count: number;
  rental_location_count: number;
}
