# STARVIS Workspace Agent Customizations

## Development Environment Skill

For running Docker Compose, applying migrations, seeding or extracting game data, running verification audits, or managing local database services, invoke the `skill` tool or read the instruction file at [.agents/skills/starvis-dev/SKILL.md](file:///c:/Users/gwenv/Projets/starvis/.agents/skills/starvis-dev/SKILL.md) to inspect the custom commands and workflow procedures.

## IHM design

When modifying the IHM, keep the whole interface uniform:
- preserve the same art direction, visual language, spacing, typography, component behavior, and page organization across all IHM screens;
- reuse existing components, layout patterns, tokens, and interaction conventions before introducing new ones;
- make every IHM change responsive first, with clean behavior on mobile, tablet, and desktop;
- verify that text, controls, tables, cards, navigation, modals, and data-heavy views do not overflow, overlap, or become hard to use on narrow screens;
- run Playwright or targeted browser checks whenever a change affects routing, rendering, interaction, layout, or responsive behavior.

## before push

Before pushing changes, run the full verification suite for the project areas touched:
- run the tests for each affected brick/workspace;
- run lint and typecheck;
- run Playwright when the change affects UI, browser flows, routing, rendering, or interaction;
- after pushing, check the GitHub CI result;
- if CI fails, inspect the failing job, fix it, rerun the relevant local checks, push the fix, and verify CI again.

Project commands:
- lint: `npm run lint:ci`
- all available typechecks: `npm run typecheck`
- API typecheck: `npm run typecheck --workspace=@starvis/api`
- IHM typecheck: `npm run typecheck --workspace=starvis-ihm`
- extractor typecheck: `npm run typecheck --workspace=@starvis/extractor`
- bot typecheck: `npm run typecheck --workspace=@starvis/bot`
- DB typecheck: `npm run typecheck --workspace=@starvis/db`
- API tests: `npm run test --workspace=@starvis/api`
- IHM tests: `npm run test --workspace=starvis-ihm`
- extractor tests: `npm run test --workspace=@starvis/extractor`
- Playwright: `npm run test:e2e --workspace=starvis-ihm`
- intelligent quality audit: `npm run quality:audit`
- API contract audit: `npm run quality:audit:contracts`
- real API/data audit: `npm run quality:audit:data`
- production API/data audit: `npm run quality:audit:data:prod`
- critical UI flows: `npm run quality:audit:ui`
- Prisma client: `npm run db:generate`
- dev compose validation: `docker compose -f docker-compose.dev.yml --env-file .env.dev.example config --quiet`
- CI check after push: `gh run list --branch main --limit 5`, then `gh run watch <run-id> --exit-status`

## Production VPS Access

This PC has the SSH keys configured to interact with the production environment.
You can execute commands on the production VPS at: `debian@ampynjord.bzh`.
Before running critical actions or updates on the production environment, always verify constraints and seek explicit confirmation if required by the data-loss prevention skill.
