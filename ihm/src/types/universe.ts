export interface UniverseOmniResult {
  id: string;
  uuid?: string;
  className?: string;
  name: string;
  category: 'ships' | 'components' | 'items' | 'locations' | 'commodities';
  type: string;
  subType?: string | null;
  manufacturer?: string | null;
  manufacturerCode?: string | null;
  thumbnail?: string | null;
  priceAuec?: number | null;
  storePriceUsd?: number | null;
  productionStatus?: string | null;
  size?: string | number | null;
  system?: string | null;
  badge?: {
    label: string;
    color: 'blue' | 'purple' | 'amber' | 'emerald' | 'cyan' | 'slate';
  };
}

export interface UniverseEntityNexus {
  entity: Record<string, any>;
  category: 'ships' | 'components' | 'items' | 'locations' | 'commodities';
  connections: {
    equippedOn?: Record<string, any>[];
    loadout?: Record<string, any>[];
    purchasableAt?: Record<string, any>[];
    shops?: Record<string, any>[];
    inventory?: Record<string, any>[];
    marketOffers?: Record<string, any>[];
    manufacturer?: Record<string, any> | null;
  };
}
