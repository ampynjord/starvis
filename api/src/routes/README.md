# API route organization

Routes are mounted through `route-groups.ts` instead of a single flat list.

- `platform`: auth, admin, health/system and operational routes.
- `static-game-data`: P4K/DataForge-backed catalog, economy and search routes.
- `rsi-network-data`: RSI website, SC Wiki and related network sync data.
- `user-features`: corporation features and assistant/chat routes.

Keep route files focused on one public domain. When adding a route, register its
mount function in the group that matches its source of truth, then update
`api/openapi.json` in the same change.

Canonical data correlation lives in `correlations.ts`:

- `GET /api/v1/correlations/domains` lists deduplicated identity domains.
- `GET /api/v1/correlations/summary` reports source coverage per domain.
- `GET /api/v1/correlations/{domain}` exposes one Starvis canonical entity with
  explicit P4K, RSI and UEX source links.

These endpoints are additive and must not replace existing resource IDs. They are
the bridge for external developers who need to link UEX, P4K and RSI records
without relying on display names.

RSI hangar sync lives with corporation fleet routes:

- `POST /corp/fleet/rsi-sync/session` creates a short-lived sync token for the signed-in Starvis user.
- `POST /corp/fleet/rsi-sync` accepts normalized hangar entries from the browser extension and mirrors only `rsi_hangar` fleet items for that user/scope.

The API must never store RSI credentials or RSI session cookies; the browser extension reads RSI pages from the user's local browser session.
