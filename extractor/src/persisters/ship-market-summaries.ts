import type { PersistContext } from './context.js';

export type ShipMarketSummaryStats = {
  ships: number;
  purchasable: number;
  rentable: number;
  noTerminalOffer: number;
};

export async function updateShipMarketSummaries(ctx: Pick<PersistContext, 'conn' | 'env'>): Promise<ShipMarketSummaryStats> {
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
         MIN(p.price) FILTER (WHERE p.price_kind = 'buy' AND p.price > 0) AS min_purchase_price,
         MIN(p.price) FILTER (WHERE p.price_kind = 'rent' AND p.price > 0) AS min_rental_price_1d,
         COUNT(DISTINCT p.terminal_uex_id) FILTER (WHERE p.price_kind = 'buy' AND p.price > 0) AS purchase_location_count,
         COUNT(DISTINCT p.terminal_uex_id) FILTER (WHERE p.price_kind = 'rent' AND p.price > 0) AS rental_location_count
       FROM game.ships sh
       LEFT JOIN game.uex_vehicle_prices p
         ON p.ship_uuid = sh.uuid
        AND p.env = sh.env
       WHERE sh.env = $1
       GROUP BY sh.uuid, sh.env
     ),
     updated AS (
       UPDATE game.ships sh
       SET game_data = jsonb_set(
         COALESCE(sh.game_data, '{}'::jsonb),
         '{market}',
         jsonb_build_object(
           'source', 'uex',
           'availability_status',
             CASE
               WHEN market.purchase_location_count > 0 AND market.rental_location_count > 0 THEN 'in_game_purchase_and_rental'
               WHEN market.purchase_location_count > 0 THEN 'in_game_purchase'
               WHEN market.rental_location_count > 0 THEN 'in_game_rental'
               ELSE 'no_official_terminal_offer'
             END,
           'min_purchase_price', market.min_purchase_price,
           'min_rental_price_1d', market.min_rental_price_1d,
           'purchase_location_count', market.purchase_location_count,
           'rental_location_count', market.rental_location_count,
           'notes',
             CASE
               WHEN market.purchase_location_count > 0 OR market.rental_location_count > 0 THEN
                 'UEX crowd-sourced market data lists at least one dealer terminal offer for this vehicle.'
               ELSE
                 'No purchase or rental terminal offer is currently listed for this vehicle in UEX market data.'
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
