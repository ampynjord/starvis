/**
 * Applies Prisma migrations, baselining databases that were originally
 * created with `prisma db push` (no _prisma_migrations table).
 *
 * Flow:
 *   1. `prisma migrate deploy`
 *   2. On P3005 ("database schema is not empty"), mark 0_init as applied
 *      (`prisma migrate resolve --applied 0_init`) and retry once.
 *
 * Any other failure exits non-zero without touching the database.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dbDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function prisma(args) {
  return execFileSync('npx', ['prisma', ...args], {
    cwd: dbDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: process.env,
  });
}

try {
  const out = prisma(['migrate', 'deploy']);
  process.stdout.write(out);
  process.exit(0);
} catch (e) {
  const stderr = String(e.stderr ?? '');
  const stdout = String(e.stdout ?? '');
  if (!/P3005/.test(stderr + stdout)) {
    process.stderr.write(stderr || stdout || String(e.message));
    process.exit(1);
  }
  console.log('Existing schema without migration history detected — baselining 0_init…');
}

try {
  process.stdout.write(prisma(['migrate', 'resolve', '--applied', '0_init']));
  process.stdout.write(prisma(['migrate', 'deploy']));
} catch (e) {
  process.stderr.write(String(e.stderr ?? e.message));
  process.exit(1);
}
