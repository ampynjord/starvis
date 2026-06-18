/**
 * Applies reviewed Prisma migrations only.
 *
 * This script intentionally does not run `prisma db push` and does not
 * auto-baseline a non-empty database. Databases must be brought under Prisma
 * migration history explicitly, then deployed with `prisma migrate deploy`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dbDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const prismaBin = (() => {
  const local = path.join(dbDir, 'node_modules', '.bin', 'prisma');
  if (existsSync(local)) return local;
  const root = path.join(dbDir, '..', 'node_modules', '.bin', 'prisma');
  if (existsSync(root)) return root;
  return 'prisma';
})();

try {
  const out = execFileSync(prismaBin, ['migrate', 'deploy', '--schema=prisma/schema'], {
    cwd: dbDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: process.env,
  });
  process.stdout.write(out);
} catch (error) {
  const message = String(error?.stderr ?? '') + String(error?.stdout ?? '') || String(error?.message ?? error);
  process.stderr.write(message);
  if (/P3005/.test(message)) {
    process.stderr.write(
      '\nDatabase is not tracked by Prisma migrations. Baseline it explicitly with `prisma migrate resolve` before deploy.\n',
    );
  }
  process.exit(1);
}
