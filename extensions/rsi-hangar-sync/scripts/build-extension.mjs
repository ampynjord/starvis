import { copyFile, cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

const targets = [
  { name: 'chrome', manifest: 'manifest.chrome.json' },
  { name: 'firefox', manifest: 'manifest.firefox.json' },
];

await rm(dist, { recursive: true, force: true });

for (const target of targets) {
  const targetDir = join(dist, target.name);
  await mkdir(targetDir, { recursive: true });
  await cp(join(root, 'src'), join(targetDir, 'src'), { recursive: true });
  await copyFile(join(root, target.manifest), join(targetDir, 'manifest.json'));
}

console.log(`Built extension bundles in ${dist}`);
