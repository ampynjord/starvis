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

export type IntentKind = 'sell' | 'buy' | 'best';

export interface Intent {
  kind: IntentKind;
  /** Ce sur quoi porte la question, nettoyé des mots de la question. */
  subject: string;
  /**
   * Taille demandée, quand la question la précise.
   *
   * « meilleur bouclier » et « meilleur bouclier taille 2 » n'appellent pas la
   * même réponse : sans taille, le plus gros gagne toujours, ce qui n'apprend
   * rien. La distinction se fait ici pour que l'affichage n'ait pas à la deviner.
   */
  size?: number;
}

/**
 * Motifs reconnus, du plus spécifique au plus général.
 *
 * L'ordre compte : « where to sell X » doit être lu avant « sell X », sinon le
 * sujet retiendrait « to sell X ».
 */
const PATTERNS: Array<{ kind: IntentKind; regex: RegExp }> = [
  // « best sell price » avant « best X » : sans cet ordre, la question de vente
  // serait lue comme une demande de classement portant sur « sell price ».
  { kind: 'sell', regex: /^(.+?)\s+(?:best\s+)?sell\s+price$/i },
  { kind: 'sell', regex: /^(?:where\s+(?:can\s+i\s+|to\s+|do\s+i\s+)?)?sell\s+(.+)$/i },
  { kind: 'buy', regex: /^(?:where\s+(?:can\s+i\s+|to\s+|do\s+i\s+)?)?buy\s+(.+)$/i },
  { kind: 'buy', regex: /^cheapest\s+(.+)$/i },
  { kind: 'best', regex: /^(?:what(?:'s| is)\s+the\s+)?(?:best|top)\s+(.+)$/i },
];

/** « shield size 2 », « size 2 shield », « s2 shield » — la taille se dit ainsi. */
const SIZE_PATTERNS = [/\bsize\s*(\d{1,2})\b/i, /\bs(\d{1,2})\b/i];

/**
 * Extrait la taille d'un sujet et la retire du texte.
 *
 * Le sujet doit rester interrogeable après coup : « shield size 2 » cherché tel
 * quel ne trouve aucun type de composant, alors que « shield » en trouve un.
 */
function splitSize(subject: string): { subject: string; size?: number } {
  for (const regex of SIZE_PATTERNS) {
    const match = subject.match(regex);
    if (!match) continue;
    const size = Number(match[1]);
    // Les composants vont de la taille 0 à 12 ; au-delà, le nombre parlait
    // d'autre chose et le retirer mutilerait le sujet.
    if (!Number.isInteger(size) || size < 0 || size > 12) continue;
    return { subject: subject.replace(regex, ' ').replace(/\s+/g, ' ').trim(), size };
  }
  return { subject };
}

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
    const raw = match[1].trim().replace(FILLER, '').trim();
    // « sell » seul n'est pas une question : sans sujet, il n'y a rien à
    // chercher, et proposer une réponse serait inventer la demande.
    if (raw.length < 2) return null;

    if (kind !== 'best') return { kind, subject: raw };

    const { subject, size } = splitSize(raw);
    if (subject.length < 2) return null;
    return { kind, subject, size };
  }
  return null;
}
