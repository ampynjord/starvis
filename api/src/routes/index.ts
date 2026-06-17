import { Router } from 'express';
import { routeMounts } from './route-groups.js';
import type { RouteDependencies } from './types.js';

export { routeGroups } from './route-groups.js';
export type { RouteDependencies } from './types.js';

export function createRoutes(deps: RouteDependencies): Router {
  const router = Router();

  for (const mount of routeMounts) {
    mount(router, deps);
  }
  return router;
}
