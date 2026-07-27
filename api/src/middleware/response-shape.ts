import type { NextFunction, Request, Response } from 'express';

/**
 * Garantit un discriminant de statut unique sur toute la surface HTTP.
 *
 * Trois conventions cohabitaient : JSend (`status: 'success'`) sur ships/items,
 * `{ success: true }` sur la majorité des routes, et du JSON brut ailleurs. Un
 * client tiers devait donc connaître la convention de chaque endpoint.
 *
 * Migrer une convention vers l'autre romprait le contrat public — `/api/v1` est
 * consommé par des intégrations tierces, et la pagination vit en racine côté
 * `{ success }` là où JSend la placerait sous `meta`. Ce middleware complète donc
 * chaque réponse avec le discriminant manquant, sans jamais déplacer ni écraser
 * quoi que ce soit : les deux lectures restent valides, et une v2 pourra retirer
 * `success` une fois les consommateurs migrés.
 *
 * La valeur est dérivée du code HTTP, pas devinée depuis le corps : `/health/ready`
 * renvoie `{ status: 'not_ready' }` avec un 503 et doit bien être marqué en échec.
 */
/**
 * Complète un corps de réponse avec le discriminant qui lui manque.
 *
 * Exporté car toutes les réponses ne passent pas par `res.json` : `sendWithETag`
 * sérialise lui-même et appelle `res.send`, ce qui couvre l'essentiel de
 * `/api/v1`. Les deux chemins partagent donc cette fonction.
 */
export function withStatusDiscriminators(body: unknown, ok: boolean): void {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return;
  const payload = body as Record<string, unknown>;
  if (!('success' in payload)) payload.success = ok;
  if (!('status' in payload)) payload.status = ok ? 'success' : 'error';
}

export function responseShapeMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = (body: unknown) => {
    withStatusDiscriminators(body, res.statusCode < 400);
    return originalJson(body);
  };

  next();
}
