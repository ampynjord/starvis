/**
 * Types partagés
 */

export interface TransformedShip {
  id: string;
  uuid?: string;
  chassisId?: number | null;
  name: string;
  manufacturer?: string;
  manufacturerTag?: string;
  slug?: string;
  url?: string;
  description?: string;
  focus?: string;
  role?: string;
  productionStatus?: string;
  size?: string;
  type?: string;
  crew?: { min?: number; max?: number };
  mass?: number;
  cargocapacity?: number;
  length?: number;
  beam?: number;
  height?: number;
  scmSpeed?: number;
  afterburnerSpeed?: number;
  lastModified?: string | null;
  media?: { storeThumb?: string; storeBanner?: string };
  specifications?: Array<{ name: string; value: string }>;
  mediaGallery?: any[];
  syncedAt?: Date;
  dataSource?: string;
  p4kData?: {
    className: string;
    manufacturerCode: string | null;
    displayName: string;
    basePath: string | null;
    mainModel: string | null;
    modelCount: number;
    interiorModelCount: number;
    exteriorModelCount: number;
    textureCount: number;
    models: { all: string[]; interior: string[]; exterior: string[] } | null;
    enrichedAt: Date | null;
  } | null;
}

export interface P4KEntry {
  fileName: string;
  uncompressedSize: number;
  compressedSize: number;
  compressionMethod: number;
  isDirectory: boolean;
  isEncrypted: boolean;
  dataOffset: number;
  localHeaderOffset: number;
}

export interface P4KVehicleData {
  uuid?: string;
  className: string;
  displayName: string;
  manufacturer: string;
  manufacturerCode: string;
  mainModel?: string;
  interiorModels: string[];
  exteriorModels: string[];
  allModels: string[];
  texturePaths: string[];
  basePath: string;
}
