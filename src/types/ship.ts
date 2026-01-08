export interface ShipSpecification {
  name: string;
  value: string;
  category?: string;
}

export interface ShipImage {
  url: string;
  type: 'thumbnail' | 'gallery' | 'blueprint' | 'other';
  alt?: string;
}

export interface ShipPrice {
  amount: number;
  currency: string;
  warbond?: number;
}

export interface Ship3DModel {
  viewerUrl?: string;
  modelUrl?: string;
}

export interface ShipData {
  id: string;
  name: string;
  manufacturer: string;
  slug: string;
  url: string;
  description?: string;
  price?: ShipPrice;
  specifications: ShipSpecification[];
  images: ShipImage[];
  model3d?: Ship3DModel;
  focus?: string;
  productionStatus?: string;
  type?: string;
  size?: string;
  crew?: {
    min?: number;
    max?: number;
  };
  scrapedAt: Date;
}

export interface ShipListItem {
  name: string;
  manufacturer: string;
  slug: string;
  url: string;
}

export interface ScrapeResult {
  success: boolean;
  data?: ShipData;
  error?: string;
}
