/**
 * Résout les imports nus du worktree `wip/herdr-agents` avec les
 * node_modules de ce worktree. Le worktree hub n'a pas les siennes.
 * Les imports relatifs restent résolus depuis herdr.
 */
const CURSOR_API_PKG = new URL('../package.json', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL ?? '';
  const bare =
    specifier.length > 0 &&
    !specifier.startsWith('.') &&
    !specifier.startsWith('/') &&
    !specifier.startsWith('file:') &&
    !specifier.startsWith('node:') &&
    !specifier.startsWith('data:');

  if (bare && parent.includes('starvis-wt-herdr')) {
    return nextResolve(specifier, { ...context, parentURL: CURSOR_API_PKG });
  }
  return nextResolve(specifier, context);
}
