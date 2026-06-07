/**
 * RSI Organizations Service
 * Fetches live org data from the RSI community org listing API.
 * Endpoint: POST https://robertsspaceindustries.com/api/orgs/getOrgs
 * Returns HTML that we parse server-side.
 */

const RSI_BASE = 'https://robertsspaceindustries.com';
const RSI_ORGS_API = `${RSI_BASE}/api/orgs/getOrgs`;

export interface RsiOrg {
  symbol: string;
  name: string;
  logoUrl: string | null;
  archetype: string | null;
  language: string | null;
  commitment: string | null;
  recruiting: boolean;
  roleplay: boolean;
  memberCount: number | null;
}

export interface RsiOrgsResult {
  orgs: RsiOrg[];
  total: number;
}

// ── HTML parser (regex-based, RSI HTML is predictable) ────────────────────────

function resolveLogoUrl(src: string): string | null {
  if (!src) return null;
  if (src.startsWith('http')) return src;
  if (src.startsWith('/')) return `${RSI_BASE}${src}`;
  return null;
}

function parseOrgsHtml(html: string): RsiOrg[] {
  const orgs: RsiOrg[] = [];
  // Split by org-cell
  const cells = html.split(/<div class="org-cell[^"]*">/);
  for (const cell of cells.slice(1)) {
    try {
      const name = cell.match(/class="trans-03s name">([^<]+)/)?.[1]?.trim() ?? null;
      const symbol = cell.match(/class="symbol">([^<]+)/)?.[1]?.trim() ?? null;
      if (!name || !symbol) continue;

      const logoSrc = cell.match(/<span class="thumb">\s*<img src="([^"]+)"/)?.[1] ?? null;
      const archetype = cell.match(/Archetype: <\/span><span class="value">([^<]+)/)?.[1]?.trim() ?? null;
      const language = cell.match(/Lang: <\/span><span class="value">([^<]+)/)?.[1]?.trim() ?? null;
      const commitment = cell.match(/Commitment: <\/span><span class="value[^"]*">([^<]+)/)?.[1]?.trim() ?? null;
      const recruitingStr = cell.match(/Recruiting: <\/span><span class="value[^"]*">([^<]+)/)?.[1]?.trim() ?? 'No';
      const roleplayStr = cell.match(/Role play: <\/span><span class="value[^"]*">([^<]+)/)?.[1]?.trim() ?? 'No';
      const memberCountStr = cell.match(/Members: <\/span><span class="value">([^<]+)/)?.[1]?.trim() ?? null;

      orgs.push({
        symbol,
        name,
        logoUrl: resolveLogoUrl(logoSrc ?? ''),
        archetype,
        language,
        commitment,
        recruiting: recruitingStr === 'Yes',
        roleplay: roleplayStr === 'Yes',
        memberCount: memberCountStr ? parseInt(memberCountStr, 10) : null,
      });
    } catch {
      // skip malformed cells
    }
  }
  return orgs;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function searchRsiOrgs(query: string, page = 1, pageSize = 12): Promise<RsiOrgsResult> {
  const body = {
    sort: 'SIZE',
    commitment: '',
    roleplay: '',
    membercount: '',
    archetype: '',
    language: '',
    recruiting: '',
    search: query.trim(),
    pagesize: pageSize,
    page,
  };

  const res = await fetch(RSI_ORGS_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Starvis-Bot/2.0',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`RSI API error: ${res.status}`);

  const data = (await res.json()) as { success?: number; data?: { totalrows?: number; html?: string } };
  if (!data?.success) throw new Error('RSI API returned failure');

  const { totalrows, html } = data.data ?? {};
  const orgs = parseOrgsHtml(html ?? '');

  return { orgs, total: totalrows ?? 0 };
}

export async function getRsiOrgBySymbol(symbol: string): Promise<RsiOrg | null> {
  const result = await searchRsiOrgs(symbol, 1, 5);
  return result.orgs.find((o) => o.symbol.toUpperCase() === symbol.toUpperCase()) ?? null;
}
