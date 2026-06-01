import affiliations from './location-affiliations.json' with { type: 'json' };

export type PoliticalAffiliation =
  | 'UEE'
  | 'Crusader'
  | 'microTech'
  | 'Hurston'
  | 'ArcCorp'
  | 'Outlaw'
  | 'XenoThreat'
  | 'Independent'
  | 'Neutral';

const AFFILIATION_MAP = affiliations as Record<string, PoliticalAffiliation>;

function getAffiliation(className: string): PoliticalAffiliation | null {
  const key = className.toLowerCase().replace(/[^a-z0-9]/g, '');
  return AFFILIATION_MAP[key] ?? null;
}

export function annotateWithAffiliation<T extends { class_name?: string }>(row: T): T & { affiliation: PoliticalAffiliation | null } {
  return {
    ...row,
    affiliation: row.class_name ? getAffiliation(row.class_name) : null,
  };
}
