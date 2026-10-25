export type UniverseCategory =
  | 'ships'
  | 'fleet'
  | 'vehicles'
  | 'components'
  | 'armor'
  | 'clothing'
  | 'weapons'
  | 'utility'
  | 'ammo'
  | 'sustenance'
  | 'locations'
  | 'commodities'
  | 'items';

export interface UniverseOmniResult {
  id: string;
  uuid?: string;
  className?: string;
  name: string;
  category: UniverseCategory;
  subCategory?: string | null;
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
    color: 'blue' | 'purple' | 'amber' | 'emerald' | 'cyan' | 'slate' | 'rose' | 'indigo' | 'lime';
  };
}

export interface UniverseEntityNexus {
  entity: Record<string, any>;
  category: UniverseCategory | string;
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

export interface TaxonomySubCategory {
  id: string;
  label_fr: string;
  label_en: string;
  count: number;
}

export interface TaxonomyCategory {
  id: string;
  label_fr: string;
  label_en: string;
  icon: string;
  total: number;
  subCategories: TaxonomySubCategory[];
}
