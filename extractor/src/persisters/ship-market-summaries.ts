import type { PersistContext } from './context.js';

export type ShipMarketSummaryStats = {
  ships: number;
  purchasable: number;
  rentable: number;
  noTerminalOffer: number;
};

export async function updateShipMarketSummaries(ctx: PersistContext): Promise<ShipMarketSummaryStats> {
  const { rows } = await ctx.conn.query<{
    ships: string;
    purchasable: string;
    rentable: string;
    no_terminal_offer: string;
  }>(
    `WITH market AS (
       SELECT
         sh.uuid,
         sh.env,
         MIN(si.base_price) FILTER (WHERE si.base_price > 0) AS min_purchase_price,
         MIN(si.rental_price_1d) FILTER (WHERE si.rental_price_1d > 0) AS min_rental_price_1d,
         MIN(si.rental_price_3d) FILTER (WHERE si.rental_price_3d > 0) AS min_rental_price_3d,
         MIN(si.rental_price_7d) FILTER (WHERE si.rental_price_7d > 0) AS min_rental_price_7d,
         MIN(si.rental_price_30d) FILTER (WHERE si.rental_price_30d > 0) AS min_rental_price_30d,
         COUNT(DISTINCT si.shop_id) FILTER (WHERE si.base_price > 0) AS purchase_location_count,
         COUNT(DISTINCT si.shop_id) FILTER (
           WHERE si.rental_price_1d > 0
              OR si.rental_price_3d > 0
              OR si.rental_price_7d > 0
              OR si.rental_price_30d > 0
         ) AS rental_location_count,
         COUNT(si.id) FILTER (WHERE si.inventory_kind = 'ship') AS extracted_ship_inventory_rows,
         COUNT(DISTINCT shops.id) FILTER (WHERE shops.shop_type = 'vehicle_rental') AS extracted_rental_terminal_rows
       FROM game.ships sh
       LEFT JOIN game.shop_inventory si
         ON si.inventory_kind = 'ship'
        AND (
          si.component_uuid = sh.uuid
          OR si.component_class_name = sh.class_name
          OR LOWER(si.component_class_name) = LOWER(sh.class_name)
        )
       LEFT JOIN game.shops shops
         ON shops.id = si.shop_id
        AND shops.env = sh.env
       WHERE sh.env = $1
       GROUP BY sh.uuid, sh.env
     ),
     updated AS (
       UPDATE game.ships sh
       SET game_data = jsonb_set(
         COALESCE(sh.game_data, '{}'::jsonb),
         '{market}',
         jsonb_build_object(
           'source', 'p4k_shop_inventory',
           'availability_status',
             CASE
               WHEN market.purchase_location_count > 0 AND market.rental_location_count > 0 THEN 'in_game_purchase_and_rental'
               WHEN market.purchase_location_count > 0 THEN 'in_game_purchase'
               WHEN market.rental_location_count > 0 THEN 'in_game_rental'
               ELSE 'no_official_terminal_offer'
             END,
           'min_purchase_price', market.min_purchase_price,
           'min_rental_price_1d', market.min_rental_price_1d,
           'min_rental_price_3d', market.min_rental_price_3d,
           'min_rental_price_7d', market.min_rental_price_7d,
           'min_rental_price_30d', market.min_rental_price_30d,
           'purchase_location_count', market.purchase_location_count,
           'rental_location_count', market.rental_location_count,
           'extracted_ship_inventory_rows', market.extracted_ship_inventory_rows,
           'extracted_rental_terminal_rows', market.extracted_rental_terminal_rows,
           'notes',
             CASE
               WHEN market.purchase_location_count > 0 OR market.rental_location_count > 0 THEN
                 'Official P4K shop inventory data contains at least one terminal offer for this vehicle.'
               ELSE
                 'No purchase or rental terminal offer was exposed for this vehicle in the current official P4K shop inventory files.'
             END
         ),
         true
       )
       FROM market
       WHERE sh.uuid = market.uuid
         AND sh.env = market.env
       RETURNING 1
     )
     SELECT
       COUNT(*)::text AS ships,
       COUNT(*) FILTER (WHERE purchase_location_count > 0)::text AS purchasable,
       COUNT(*) FILTER (WHERE rental_location_count > 0)::text AS rentable,
       COUNT(*) FILTER (WHERE purchase_location_count = 0 AND rental_location_count = 0)::text AS no_terminal_offer
     FROM market`,
    [ctx.env],
  );
  const row = rows[0];
  return {
    ships: Number(row?.ships ?? 0),
    purchasable: Number(row?.purchasable ?? 0),
    rentable: Number(row?.rentable ?? 0),
    noTerminalOffer: Number(row?.no_terminal_offer ?? 0),
  };
}
