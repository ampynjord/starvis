/**
 * SC Wiki component enrichment — supprimé.
 *
 * Les grades et classes des composants viennent désormais directement
 * des données de jeu (P4K / DataForge). Ce fichier ne fait plus d'appel
 * externe ; il existe uniquement pour ne pas casser les imports existants.
 */

export type ComponentWikiEnrichment = {
  grade: string | null;
  componentClass: string | null;
};

export async function fetchComponentWikiEnrichment(
  _componentTypes: Iterable<string>,
): Promise<Map<string, ComponentWikiEnrichment>> {
  return new Map();
}
