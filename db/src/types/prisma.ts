import type { PrismaClient } from '../client/prisma.js';

/**
 * Le client de base de données tel que le voient les services.
 *
 * Ce type décrivait auparavant trois méthodes — `$queryRawUnsafe`,
 * `$executeRawUnsafe`, `$disconnect` — et rien d'autre. L'objet réellement passé
 * a toujours été un `PrismaClient` complet : la restriction n'était pas une
 * contrainte technique mais une déclaration d'intention, « ici on écrit du SQL
 * brut ».
 *
 * Cette intention est désormais l'inverse de celle du projet. Les 195 appels
 * `$queryRawUnsafe` répartis dans 19 services renvoient tous
 * `Record<string, any>` : aucune garantie sur les colonnes, aucune sur les
 * types, aucune erreur de compilation quand une colonne disparaît du schéma. Le
 * type interdisait précisément l'outil qui corrige cela.
 *
 * Il devient donc un alias du client généré. Les services gardent le nom
 * `PrismaLike` — le renommer dans dix-huit fichiers ne dirait rien de plus — et
 * accèdent aux modèles typés au fur et à mesure de leur migration.
 *
 * Aucune dépendance nouvelle : `db/src/index.ts` exportait déjà `PrismaClient`
 * depuis le client généré, et `api/src/routes/types.ts` l'utilisait.
 *
 * **Le typage n'est pas le contrat.** L'API publique sert du `snake_case` là où
 * Prisma rend du `camelCase` : toute migration vers l'accès typé doit sérialiser
 * explicitement vers le contrat public, et le prouver par égalité stricte des
 * sorties. Voir `docs/surface-api.md` §5.
 */
export type PrismaLike = PrismaClient;
