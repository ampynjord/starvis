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

const matchPattern = /^(https?|wss?|file|ftp|\*):\/\/(\*|\*\.[^*/]+|[^*/]+)\/.*$/;

for (const file of required) {
  await readFile(join(root, file), 'utf8');
}

function assertValidPattern(manifestFile, pattern) {
  if (pattern === '<all_urls>') return;
  if (!matchPattern.test(pattern)) {
    throw new Error(`${manifestFile}: invalid extension match pattern "${pattern}"`);
  }
}

for (const manifestFile of ['manifest.chrome.json', 'manifest.firefox.json']) {
  const manifest = JSON.parse(await readFile(join(root, manifestFile), 'utf8'));
  if (manifest.manifest_version !== 3) throw new Error(`${manifestFile}: manifest_version must be 3`);
  if (manifestFile.includes('firefox') && !manifest.background?.scripts?.includes('src/background.js')) {
    throw new Error(`${manifestFile}: Firefox requires background.scripts`);
  }
  if (manifestFile.includes('chrome') && manifest.background?.service_worker !== 'src/background.js') {
    throw new Error(`${manifestFile}: Chrome requires background.service_worker`);
  }
  if (!manifest.permissions?.includes('tabs')) throw new Error(`${manifestFile}: tabs permission missing`);
  if (!manifest.host_permissions?.some((host) => host.includes('robertsspaceindustries.com'))) {
    throw new Error(`${manifestFile}: RSI host permission missing`);
  }
  for (const pattern of manifest.host_permissions ?? []) {
    assertValidPattern(manifestFile, pattern);
  }
  for (const script of manifest.content_scripts ?? []) {
    for (const pattern of script.matches ?? []) {
      assertValidPattern(manifestFile, pattern);
    }
  }
}
