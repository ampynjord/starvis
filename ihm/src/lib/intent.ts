/**
 * Reconnaître une question dans une recherche.
 *
 * Le wiki s'aborde aujourd'hui par la table : on choisit une bibliothèque, puis
 * on filtre. Une partie des questions qu'on lui pose n'a pourtant pas besoin de
 * ce détour — « où vendre de l'agricium » appelle un lieu et un prix, pas une
 * liste de marchandises à parcourir.
 *
 * Ce module ne fait qu'une chose : dire si une saisie ressemble à une question
 * connue, et laquelle. Il ne cherche rien, ne calcule rien, n'affiche rien —
 * ce qui le rend vérifiable seul.
 *
 * ── Ce qu'il refuse de faire ─────────────────────────────────────────────────
 *
 * Deviner. Une saisie qui ne correspond à aucun motif ne produit pas d'intention
 * approximative : elle retombe sur la recherche ordinaire, qui fait très bien
 * son travail. Une réponse directe fausse coûte plus cher qu'une liste de
 * résultats.
 */

export type IntentKind = 'sell' | 'buy';

export interface Intent {
  kind: IntentKind;
  /** Ce sur quoi porte la question, nettoyé des mots de la question. */
  subject: string;
}

/**
 * Motifs reconnus, du plus spécifique au plus général.
 *
 * L'ordre compte : « where to sell X » doit être lu avant « sell X », sinon le
 * sujet retiendrait « to sell X ».
 */
const PATTERNS: Array<{ kind: IntentKind; regex: RegExp }> = [
  { kind: 'sell', regex: /^(?:where\s+(?:can\s+i\s+|to\s+|do\s+i\s+)?)?sell\s+(.+)$/i },
  { kind: 'sell', regex: /^(.+?)\s+(?:best\s+)?sell\s+price$/i },
  { kind: 'buy', regex: /^(?:where\s+(?:can\s+i\s+|to\s+|do\s+i\s+)?)?buy\s+(.+)$/i },
  { kind: 'buy', regex: /^cheapest\s+(.+)$/i },
];

/** Mots qui encadrent la question sans désigner le sujet. */
const FILLER = /^(?:some|any|a|an|the)\s+/i;

/**
 * Rend l'intention d'une saisie, ou `null` si elle n'en porte aucune.
 *
 * Le sujet est rendu tel que saisi, aux mots de liaison près : c'est à
 * l'appelant de le confronter aux données, pas à ce module de décider qu'un
 * sujet existe.
 */
export function parseIntent(input: string): Intent | null {
  const query = input.trim().replace(/[?！!.]+$/u, '');
  if (query.length < 3) return null;

  for (const { kind, regex } of PATTERNS) {
    const match = query.match(regex);
    if (!match) continue;
    const subject = match[1].trim().replace(FILLER, '').trim();
    // « sell » seul n'est pas une question : sans sujet, il n'y a rien à
    // chercher, et proposer une réponse serait inventer la demande.
    if (subject.length < 2) return null;
    return { kind, subject };
  }
  return null;
}
