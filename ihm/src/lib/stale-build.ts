// Next.js keeps a client bundle alive across App Router navigations for as long as a tab
// stays open. If the server gets redeployed underneath a tab that's been idle for a while,
// the bundle keeps referencing chunk hashes and Server Action IDs the running server no
// longer has, so every click can silently fail (fetch never fires, no server log, no error
// shown to the user) instead of surfacing a helpful message.
const STALE_BUILD_PATTERN = /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to find Server Action|dynamically imported module/i;
const RELOAD_GUARD_KEY = 'starvis:staleBuildReloadAt';
const RELOAD_GUARD_WINDOW_MS = 15_000;

export function isStaleBuildError(message: string | undefined | null): boolean {
  return !!message && STALE_BUILD_PATTERN.test(message);
}

export function reloadOnceForStaleBuild(): void {
  if (typeof window === 'undefined') return;
  const lastAttempt = Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
  if (Date.now() - lastAttempt < RELOAD_GUARD_WINDOW_MS) return;
  window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  window.location.reload();
}
