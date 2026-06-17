import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const required = [
  'manifest.chrome.json',
  'manifest.firefox.json',
  'src/background.js',
  'src/starvis-content.js',
  'src/rsi-hangar-content.js',
];

for (const file of required) {
  await readFile(join(root, file), 'utf8');
}

for (const manifestFile of ['manifest.chrome.json', 'manifest.firefox.json']) {
  const manifest = JSON.parse(await readFile(join(root, manifestFile), 'utf8'));
  if (manifest.manifest_version !== 3) throw new Error(`${manifestFile}: manifest_version must be 3`);
  if (!manifest.permissions?.includes('tabs')) throw new Error(`${manifestFile}: tabs permission missing`);
  if (!manifest.host_permissions?.some((host) => host.includes('robertsspaceindustries.com'))) {
    throw new Error(`${manifestFile}: RSI host permission missing`);
  }
}
