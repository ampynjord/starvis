# STARVIS Quality Audits

This folder contains higher-level checks for user flows and data quality.

## Data audit

The data audit calls a real API and checks that critical endpoints respond with usable, coherent data.

```bash
npm run quality:audit:data
npm run quality:audit:data -- --base-url http://127.0.0.1:3000 --env live
npm run quality:audit:data:prod
```

Use strict mode when the target database is expected to be populated:

```bash
npm run quality:audit:data -- --strict
```

The audit checks:

- health endpoints;
- version and extraction date;
- overview counts;
- list and detail endpoints for ships, components, items and commodities;
- manufacturers, Ship Matrix, Galactapedia and Starmap;
- duplicate identifiers in returned samples;
- non-negative numeric fields;
- placeholder-like text values;
- a representative global search.

## API contract audit

The API contract audit checks the OpenAPI document, operation identifiers, the public API proxy, and the broad IHM type surface.

```bash
npm run quality:audit:contracts
```

Use it after route, Swagger, proxy or API type changes. It is intentionally fast and complements the full data audit.

## UI critical flows

The UI critical flows run Playwright against the Next.js app with deterministic API fixtures. They verify that key pages render, navigate and consume API-shaped data without browser errors.

```bash
npm run quality:audit:ui
```

These tests complement, but do not replace, the data audit. If UI flows fail, the browser experience is broken. If the data audit fails, the real API/database content is missing, incoherent or not usable enough.
