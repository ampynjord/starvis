/**
 * Allowlist of browser-facing paths forwarded to the Express API.
 *
 * The generic handler in `app/api/[...path]/route.ts` only forwards paths listed
 * here. An allowlist rather than a blind forward: the Next proxy holds the user's
 * session token, so an unlisted upstream endpoint must never become reachable
 * just because it exists on the Express side.
 *
 * Routes needing more than a forward — session cookies (login/logout/me/
 * verify-email/2fa-verify), the server-key public API proxy, chat streaming —
 * keep their own handler. Static routes win over this catch-all in Next's
 * matcher, so they take precedence automatically.
 */

export interface ProxyRule {
  /** Matched against the path after `/api`, e.g. `/admin/users/12/role`. */
  match: RegExp;
  /** `session` requires the Starvis session cookie; `public` is forwarded anonymously. */
  auth: 'session' | 'public';
  /** Upstream path when it differs from the incoming one. */
  upstream?: (path: string) => string;
}

export const PROXY_RULES: readonly ProxyRule[] = [
  // ── Admin ──────────────────────────────────────────────────────────────────
  { match: /^\/admin\/api-supervision$/, auth: 'session' },
  { match: /^\/admin\/api-tokens(\/[^/]+)?$/, auth: 'session' },
  { match: /^\/admin\/bug-reports(\/[^/]+)?$/, auth: 'session' },
  { match: /^\/admin\/developer-access-requests(\/[^/]+)?$/, auth: 'session' },
  { match: /^\/admin\/request-logs$/, auth: 'session' },
  { match: /^\/admin\/users$/, auth: 'session' },
  { match: /^\/admin\/users\/[^/]+$/, auth: 'session' },
  { match: /^\/admin\/users\/[^/]+\/(role|reset-password)$/, auth: 'session' },

  // ── Compte connecté ────────────────────────────────────────────────────────
  { match: /^\/auth\/2fa\/(setup|enable|disable)$/, auth: 'session' },
  { match: /^\/auth\/api-token$/, auth: 'session' },
  { match: /^\/auth\/api-tokens(\/[^/]+)?$/, auth: 'session' },
  { match: /^\/auth\/developer-access-request$/, auth: 'session' },

  // ── Parcours d'authentification sans session ───────────────────────────────
  { match: /^\/auth\/(register|forgot-password|reset-password)$/, auth: 'public' },

  // ── Signalements — seule route dont le chemin amont diffère ────────────────
  { match: /^\/bug-reports$/, auth: 'session', upstream: (path) => `/api/v1${path}` },
];

export function resolveProxyRule(path: string): ProxyRule | undefined {
  return PROXY_RULES.find((rule) => rule.match.test(path));
}
