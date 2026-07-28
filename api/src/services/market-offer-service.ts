/**
 * MarketOfferService — où acheter quoi, toutes sources confondues.
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';

/**
 * Une offre telle que l'API la sert.
 *
 * Répondre à « où acheter cet objet » demandait de savoir laquelle des tables
 * interroger — `shop_inventory` pour ce que le P4K décrit, `uex_market_prices`
 * pour ce que les joueurs relèvent — et de recommencer pour un composant ou une
 * marchandise. La vue `game.market_offers` réunit les deux ; ce service la sert.
 *
 * Les colonnes `Decimal` se sérialisent en chaînes (`"16000.00"`), les `Int` en
 * nombres : c'est la convention de toute l'API, et elle vaut ici aussi.
 */
export interface PublicMarketOffer {
  entity_uuid: string;
  /** `p4k` (ce que le jeu décrit) ou `uex` (ce que les joueurs relèvent). */
  source: string;
  /** L'enseigne, quand elle vient du P4K ; le nom du terminal chez UEX. */
  outlet_name: string | null;
  /**
   * Le lieu, seulement pour les offres P4K.
   *
   * UEX ne rattache pas ses terminaux à nos lieux : son nom de terminal dit où
   * aller, il ne relie pas à une fiche.
   */
  location_uuid: string | null;
  location_name: string | null;
  price_buy: string | null;
  price_sell: string | null;
  stock_current: number | null;
  stock_max: number | null;
  observed_at: string | null;
}

export interface MarketOfferSummary {
  entity_uuid: string;
  offers: PublicMarketOffer[];
  /** Le moins cher, parce que c'est la question qu'on pose en cherchant où acheter. */
  best_buy: PublicMarketOffer | null;
  /** Le mieux payé, pour la question inverse. */
  best_sell: PublicMarketOffer | null;
  sources: string[];
}

function toPublic(row: {
  entityUuid: string;
  source: string;
  outletName: string | null;
  locationUuid: string | null;
  locationName: string | null;
  priceBuy: unknown;
  priceSell: unknown;
  stockCurrent: number | null;
  stockMax: number | null;
  observedAt: Date | null;
}): PublicMarketOffer {
  return {
    entity_uuid: row.entityUuid,
    source: row.source,
    outlet_name: row.outletName,
    location_uuid: row.locationUuid,
    location_name: row.locationName,
    price_buy: row.priceBuy == null ? null : String(row.priceBuy),
    price_sell: row.priceSell == null ? null : String(row.priceSell),
    stock_current: row.stockCurrent,
    stock_max: row.stockMax,
    observed_at: row.observedAt ? row.observedAt.toISOString() : null,
  };
}

const numeric = (value: string | null): number | null => (value == null ? null : Number(value));

export class MarketOfferService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Les offres pour une entité, du moins cher au plus cher.
   *
   * L'entité peut être un objet, un composant, une marchandise ou un vaisseau :
   * la vue ne fait pas la différence, et c'est précisément ce qui permet de
   * poser une seule question.
   */
  async forEntity(entityUuid: string, env = 'live', limit = 200): Promise<MarketOfferSummary> {
    const rows = await this.prisma.marketOffer.findMany({
      where: { env, entityUuid },
      orderBy: [{ priceBuy: 'asc' }],
      take: limit,
    });

    const offers = rows.map(toPublic);

    // Le meilleur prix se calcule ici plutôt qu'en SQL : deux passes sur deux
    // cents lignes coûtent moins qu'une requête d'agrégat de plus, et le
    // consommateur reçoit la réponse sans avoir à la refaire.
    let bestBuy: PublicMarketOffer | null = null;
    let bestSell: PublicMarketOffer | null = null;
    for (const offer of offers) {
      const buy = numeric(offer.price_buy);
      if (buy != null && buy > 0 && (bestBuy == null || buy < (numeric(bestBuy.price_buy) as number))) bestBuy = offer;
      const sell = numeric(offer.price_sell);
      if (sell != null && sell > 0 && (bestSell == null || sell > (numeric(bestSell.price_sell) as number))) bestSell = offer;
    }

    return {
      entity_uuid: entityUuid,
      offers,
      best_buy: bestBuy,
      best_sell: bestSell,
      sources: [...new Set(offers.map((offer) => offer.source))].sort(),
    };
  }
}
