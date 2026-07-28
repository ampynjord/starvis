-- Où acheter quoi, toutes sources confondues.
--
-- Une vue, non une table : les prix vivent dans `game.shop_inventory` (ce que le
-- P4K décrit) et `game.uex_market_prices` (ce que les joueurs relèvent). Les
-- recopier ailleurs les ferait diverger dès la première extraction.
--
-- Répondre à « où acheter cet objet » demandait jusqu'ici de savoir laquelle des
-- deux tables interroger, et de le refaire pour un composant ou une marchandise.
-- La vue répond en une requête, quel que soit le domaine.
--
-- `NULLIF(prix, 0)` : un prix à zéro n'est pas un prix, c'est une absence. Le
-- laisser passer ferait remonter des articles « gratuits » en tête d'un
-- classement par prix croissant.

CREATE OR REPLACE VIEW "game"."market_offers" AS
SELECT
  s."env",
  si."component_uuid"        AS "entity_uuid",
  'p4k'::text                AS "source",
  s."id"                     AS "shop_id",
  s."name"                   AS "outlet_name",
  s."location_uuid",
  s."location"               AS "location_name",
  NULLIF(si."base_price", 0) AS "price_buy",
  NULLIF(si."sell_price", 0) AS "price_sell",
  si."current_inventory"     AS "stock_current",
  si."max_inventory"         AS "stock_max",
  si."updated_at"            AS "observed_at"
FROM "game"."shop_inventory" si
JOIN "game"."shops" s ON s."id" = si."shop_id"
WHERE si."component_uuid" IS NOT NULL

UNION ALL

-- UEX ne rattache pas ses terminaux à nos lieux : le nom du terminal est tout
-- ce qu'on a. C'est assez pour dire où aller, pas pour relier à une fiche.
SELECT
  p."env",
  p."entity_uuid",
  'uex'::text,
  NULL::int,
  p."terminal_name",
  NULL::varchar,
  NULL::text,
  NULLIF(p."price_buy", 0),
  NULLIF(p."price_sell", 0),
  NULL::int,
  NULL::int,
  p."date_modified"
FROM "game"."uex_market_prices" p
WHERE p."entity_uuid" IS NOT NULL;
