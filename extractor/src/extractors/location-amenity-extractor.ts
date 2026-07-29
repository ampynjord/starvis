/**
 * Ce qu'on peut faire à un endroit.
 *
 * `StarMapObject.amenities` porte des références vers `StarMapAmenityTypeEntry` :
 * hangar large, plateforme d'atterrissage moyenne, achat d'armure, cour de
 * restauration, ascenseur de fret, services véhicule. Rien ne les extrayait, et
 * c'est pourtant la réponse à « qu'est-ce que je trouve sur cette station ».
 *
 * Les commodités sont déclarées sur les gabarits autant que sur les lieux réels
 * — `HightechOutpost_TEMPLATE` en porte quatre. Le filtrage des gabarits reste
 * celui de l'extraction des lieux : on ne rattache une commodité qu'à un lieu
 * effectivement retenu.
 */
import type { DataForgeContext } from '../dataforge/dataforge-utils.js';
import logger from '../logger.js';

export interface AmenityType {
  /** Le GUID DataForge de l'entrée de catalogue. */
  id: string;
  /** Le nom interne, lisible tel quel : « Hangar L », « Food Court ». */
  name: string;
  /** Le nom affiché par le jeu, une fois la clé de localisation résolue. */
  displayName: string | null;
  locKey: string | null;
  iconPath: string | null;
}

export interface LocationAmenityLink {
  locationClassName: string;
  amenityId: string;
}

interface LocAdapter {
  resolveKey(key: string): string | null;
}

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

function refGuid(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const ref = (value as { __ref?: unknown }).__ref;
  if (typeof ref !== 'string' || ref === EMPTY_GUID) return null;
  return ref.toLowerCase();
}

/** Le catalogue des commodités : une entrée par service que le jeu sait afficher. */
export function extractAmenityTypes(df: DataForgeContext, loc: LocAdapter): AmenityType[] {
  const dfData = df.getDfData();
  if (!dfData) return [];

  const structIdx = dfData.structDefs.findIndex((def: { name: string }) => def.name === 'StarMapAmenityTypeEntry');
  if (structIdx === -1) {
    logger.warn('DataForge: no "StarMapAmenityTypeEntry" struct found', { module: 'location-amenity-extractor' });
    return [];
  }

  const types: AmenityType[] = [];
  for (const record of dfData.records) {
    if (record.structIndex !== structIdx) continue;
    const data = df.readInstance(record.structIndex, record.instanceIndex, 0, 2) as Record<string, unknown> | null;
    if (!data) continue;

    const id = String((record as unknown as { id?: string }).id ?? '').toLowerCase();
    const name = typeof data.name === 'string' ? data.name : null;
    if (!id || !name) continue;

    const locKey = typeof data.displayName === 'string' && data.displayName.startsWith('@') ? data.displayName : null;
    types.push({
      id,
      name,
      // Le nom interne fait office de repli : il est deja lisible, contrairement
      // aux noms de classe d'autres domaines.
      displayName: (locKey ? loc.resolveKey(locKey) : null) ?? name,
      locKey,
      iconPath: typeof data.icon === 'string' && data.icon ? data.icon : null,
    });
  }

  logger.info(`StarMapAmenityTypeEntry: ${types.length} amenity types`, { module: 'location-amenity-extractor' });
  return types;
}

/**
 * Les liens lieu → commodité, pour les lieux retenus seulement.
 *
 * `keptClassNames` vient de l'extraction des lieux : sans lui, on rattacherait
 * des commodités à des gabarits qui ne sont pas des endroits.
 */
export function extractLocationAmenities(df: DataForgeContext, keptClassNames: ReadonlySet<string>): LocationAmenityLink[] {
  const dfData = df.getDfData();
  if (!dfData) return [];

  const structIdx = dfData.structDefs.findIndex((def: { name: string }) => def.name === 'StarMapObject');
  if (structIdx === -1) return [];

  const links: LocationAmenityLink[] = [];
  for (const record of dfData.records) {
    if (record.structIndex !== structIdx) continue;
    const className = String(record.name ?? '').replace(/^StarMapObject\./i, '');
    if (!keptClassNames.has(className)) continue;

    const data = df.readInstance(record.structIndex, record.instanceIndex, 0, 3) as Record<string, unknown> | null;
    const amenities = data?.amenities;
    if (!Array.isArray(amenities)) continue;

    const seen = new Set<string>();
    for (const entry of amenities) {
      const guid = refGuid(entry);
      // Un meme service peut etre declare deux fois sur un lieu ; la table le
      // refuserait, et l'information n'est pas differente pour autant.
      if (!guid || seen.has(guid)) continue;
      seen.add(guid);
      links.push({ locationClassName: className, amenityId: guid });
    }
  }

  logger.info(`StarMapObject: ${links.length} location↔amenity links`, { module: 'location-amenity-extractor' });
  return links;
}
