/**
 * Applies Prisma migrations, baselining databases that were originally
 * created with `prisma db push` (no _prisma_migrations table).
 *
 * Flow:
 *   1. `prisma migrate deploy`
 *   2. On P3005 ("database schema is not empty"), mark the first migration as
 *      applied (`prisma migrate resolve --applied <name>`) and retry once.
 *
 * Any other failure exits non-zero without touching the database.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dbDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Prefer the workspace-local binary over anything found via PATH/npx.
const prismaBin = (() => {
  const local = path.join(dbDir, 'node_modules', '.bin', 'prisma');
  if (existsSync(local)) return local;
  const root = path.join(dbDir, '..', 'node_modules', '.bin', 'prisma');
  if (existsSync(root)) return root;
  return 'prisma';
})();

function prisma(args) {
  return execFileSync(prismaBin, args, {
    cwd: dbDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: process.env,
  });
}

function firstMigration() {
  const dir = path.join(dbDir, 'prisma', 'migrations');
  if (!existsSync(dir)) return null;
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  return entries[0] ?? null;
}

try {
  const out = prisma(['migrate', 'deploy']);
  process.stdout.write(out);
  process.exit(0);
} catch (e) {
  const combined = String(e.stderr ?? '') + String(e.stdout ?? '');
  if (!/P3005/.test(combined)) {
    process.stderr.write(combined || String(e.message));
    process.exit(1);
  }
}

const baseline = firstMigration();
if (!baseline) {
  process.stderr.write('No migrations found — cannot baseline.\n');
  process.exit(1);
}

console.log(`Existing schema without migration history detected — baselining ${baseline}…`);

try {
  process.stdout.write(prisma(['migrate', 'resolve', '--applied', baseline]));
  process.stdout.write(prisma(['migrate', 'deploy']));
} catch (e) {
  process.stderr.write(String(e.stderr ?? e.message));
  process.exit(1);
}
