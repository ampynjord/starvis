# STARVIS DB

Database workspace for Prisma, PostgreSQL bootstrap scripts, and the shared Prisma client.

## Structure

| Path | Role |
|---|---|
| `prisma/schema/00-base.prisma` | Prisma generator and datasource. |
| `prisma/schema/10-meta.prisma` | Users, corporations, bug reports, extraction logs and changelog. |
| `prisma/schema/20-rsi.prisma` | RSI website data: ship matrix, Galactapedia, comm-links, starmap. |
| `prisma/schema/30-game.prisma` | P4K/DataForge game data: ships, components, items, commodities, shops, missions, crafting. |
| `src/client/` | Prisma singleton client. |
| `src/env/` | Shared database environment helpers. |
| `src/types/` | Public Prisma helper types. |
| `src/legacy.ts` | Deprecated compatibility exports kept for existing imports. |
| `scripts/` | PostgreSQL init and backup shell scripts. |

`src/index.ts` is the public entrypoint consumed as `@starvis/db`.

## Commands

```bash
npm run generate --workspace=@starvis/db
npm run push --workspace=@starvis/db
npm run migrate --workspace=@starvis/db
npm run studio --workspace=@starvis/db
```

The schema is a folder. Keep new models in the domain file that owns the table, and keep datasource URLs in `prisma.config.ts`.
