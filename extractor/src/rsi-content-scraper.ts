/**
 * rsi-content-scraper.ts
 *
 * Fetches RSI comm-link and galactapedia pages and extracts the article HTML.
 *
 * RSI comm-links use "Alexandria" content delivery: the page HTML contains an
 * inline `const s3Url = '...'` that points to a JSON-like HTML fragment made of
 * Vue web-components (<g-article body="...">, <g-illustration :simple-image="...">,
 * <g-introduction :info="{...}">). This file parses those components to reassemble
 * a clean HTML document suitable for display in Starvis.
 *
 * Galactapedia pages still use server-side rendered HTML with known div classes.
 */

import logger from './logger.js';

const RSI_BASE = 'https://robertsspaceindustries.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; StarvisBot/1.0; +https://starvis.ampynjord.bzh)';
const REQUEST_TIMEOUT_MS = 15_000;

// ── HTML helpers ──────────────────────────────────────────────────────────────

function htmlDecode(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&#60;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#62;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/** Rewrite relative /path → absolute RSI URL in src and href attributes. */
function absolutifyUrls(html: string): string {
  return html
    .replace(/\bsrc="(?!https?:\/\/)\/([^"]*)"/g, `src="${RSI_BASE}/$1"`)
    .replace(/\bhref="(?!https?:\/\/)\/([^"]*)"/g, `href="${RSI_BASE}/$1"`);
}

/** Strip scripts, styles, noscript, HTML comments. */
function removeNonContent(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function cleanHtml(raw: string): string {
  let html = removeNonContent(raw);
  html = absolutifyUrls(html);
  html = html.replace(/(\s*\n){3,}/g, '\n\n').trim();
  return html;
}

// ── Alexandria content parser ─────────────────────────────────────────────────

/**
 * Parses RSI Alexandria HTML fragments (Vue web-components) and reassembles
 * them into clean displayable HTML.
 *
 * Component types handled:
 *   <g-introduction :info="{title,subtitle,contents:[HTML]}">
 *   <g-article body="<h4>...</h4><p>...">
 *   <g-illustration :simple-image="{originalFormat:{desktop:'/i/...'}, alt:'...'}">
 */
function extractAlexandriaContent(html: string): string | null {
  const parts: string[] = [];

  // g-introduction: intro paragraph(s) from :info.contents
  for (const m of html.matchAll(/:info="([^"]+)"/g)) {
    try {
      const info = JSON.parse(htmlDecode(m[1])) as { contents?: unknown[] };
      if (Array.isArray(info.contents)) {
        for (const c of info.contents) {
          if (typeof c === 'string' && c.trim()) {
            parts.push(htmlDecode(c));
          }
        }
      }
    } catch {
      // malformed JSON — skip
    }
  }

  // g-article body + g-illustration images in document order
  for (const m of html.matchAll(/\bbody="([^"]{20,})"|:simple-image="([^"]+)"/g)) {
    if (m[1] !== undefined) {
      const body = htmlDecode(m[1]);
      if (body.trim()) parts.push(body);
    } else if (m[2] !== undefined) {
      try {
        const img = JSON.parse(htmlDecode(m[2])) as {
          originalFormat?: { desktop?: string };
          webp?: { desktop?: string };
          alt?: string;
        };
        const url = img.originalFormat?.desktop ?? img.webp?.desktop;
        if (url) {
          const absUrl = url.startsWith('/') ? `${RSI_BASE}${url}` : url;
          parts.push(`<img src="${absUrl}" alt="${img.alt ?? ''}" />`);
        }
      } catch {
        // malformed JSON — skip
      }
    }
  }

  // g-header: section headings + body text (used in design-heavy / lore comm-links)
  for (const hm of html.matchAll(/<g-header[\s\S]*?<\/g-header>/g)) {
    const headerHtml = hm[0];
    const titleM = /<template\s[^>]*slot="title"[^>]*>([\s\S]+?)<\/template>/i.exec(headerHtml);
    const contentM = /<template\s[^>]*slot="content"[^>]*>([\s\S]+?)<\/template>/i.exec(headerHtml);
    if (titleM) {
      const titleText = titleM[1].replace(/<[^>]+>/g, '').trim();
      if (titleText) parts.push(`<h2>${titleText}</h2>`);
    }
    if (contentM?.[1].trim()) parts.push(contentM[1].trim());
  }

  // plugin_trblt_rawmarkup: raw HTML tables / structured blocks
  for (const rm of html.matchAll(/data-plugin_key="plugin_trblt_rawmarkup"[^>]*><\/div>([\s\S]+?)(?=<div class="turbo-anchor"|$)/g)) {
    const rawHtml = rm[1].trim();
    if (rawHtml) parts.push(rawHtml);
  }

  if (parts.length === 0) return null;

  const cleaned = cleanHtml(parts.join('\n\n'));
  // Reject result if it contains no substantial text (only CSS / markup)
  const textOnly = cleaned
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .trim();
  return textOnly.length >= 80 ? cleaned : null;
}

// ── Legacy div-class extractor (for older pages / galactapedia) ───────────────

/**
 * Extracts the inner HTML of the first `<div>` element whose `class` attribute
 * contains `className` as a whole word. Handles arbitrary nesting by counting
 * div open/close tokens.
 */
function findDivInnerHtml(html: string, className: string): string | null {
  let searchFrom = 0;

  while (searchFrom < html.length) {
    const divOpen = html.indexOf('<div', searchFrom);
    if (divOpen === -1) return null;

    const tagClose = html.indexOf('>', divOpen);
    if (tagClose === -1) return null;

    const fullTag = html.slice(divOpen, tagClose + 1);
    const classMatch = /\bclass="([^"]*)"/i.exec(fullTag);
    const hasClass = classMatch ? classMatch[1].split(/\s+/).includes(className) : false;
    const contentStart = tagClose + 1;

    if (!hasClass) {
      searchFrom = divOpen + 4;
      continue;
    }

    let pos = contentStart;
    let depth = 1;

    while (pos < html.length && depth > 0) {
      const nextOpen = html.indexOf('<div', pos);
      const nextClose = html.indexOf('</div>', pos);

      if (nextOpen !== -1 && (nextClose === -1 || nextOpen < nextClose)) {
        const peekClose = html.indexOf('>', nextOpen);
        if (peekClose !== -1 && html[peekClose - 1] !== '/') depth++;
        pos = nextOpen + 4;
      } else if (nextClose !== -1) {
        depth--;
        if (depth === 0) return html.slice(contentStart, nextClose);
        pos = nextClose + 6;
      } else {
        break;
      }
    }

    searchFrom = divOpen + 4;
  }

  return null;
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn(`[rsi-scraper] HTTP ${res.status} — ${url}`);
      return null;
    }
    return res.text();
  } catch (err) {
    logger.warn(`[rsi-scraper] fetch error for ${url}: ${(err as Error).message}`);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scrape the article body HTML from an RSI comm-link page.
 *
 * Modern RSI comm-links load content via the Alexandria CDN (an S3-like URL
 * embedded as `const s3Url = '...'` in an inline script). We fetch that URL
 * first and parse the Vue web-component markup.  Older comm-links fall back
 * to the legacy CSS-class approach.
 */
export async function scrapeCommLinkContent(rsiUrl: string): Promise<string | null> {
  const pageHtml = await fetchHtml(rsiUrl);
  if (!pageHtml) return null;

  // Modern path: Alexandria CDN
  const s3Match = /const s3Url\s*=\s*'([^']+)'/.exec(pageHtml);
  if (s3Match) {
    const alexandriaHtml = await fetchHtml(s3Match[1]);
    if (alexandriaHtml) {
      const content = extractAlexandriaContent(alexandriaHtml);
      if (content && content.trim().length > 100) return content;
    }
  }

  // Legacy fallback: server-side rendered pages with known div classes
  const COMM_LINK_CLASSES = ['body-copy', 'content-block', 'article-content', 'article-body', 'content'];
  for (const cls of COMM_LINK_CLASSES) {
    const content = findDivInnerHtml(pageHtml, cls);
    if (content && content.trim().length > 150) return cleanHtml(content);
  }

  const articleMatch = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(pageHtml);
  if (articleMatch && articleMatch[1].trim().length > 150) {
    return cleanHtml(articleMatch[1]);
  }

  logger.warn(`[rsi-scraper] could not extract comm-link content from ${rsiUrl}`);
  return null;
}

/**
 * Scrape the article body HTML from an RSI Galactapedia page.
 * Galactapedia still uses server-side rendered HTML.
 */
export async function scrapeGalactapediaContent(rsiUrl: string): Promise<string | null> {
  const html = await fetchHtml(rsiUrl);
  if (!html) return null;

  // Try Alexandria first (in case galactapedia also migrated)
  const s3Match = /const s3Url\s*=\s*'([^']+)'/.exec(html);
  if (s3Match) {
    const alexandriaHtml = await fetchHtml(s3Match[1]);
    if (alexandriaHtml) {
      const content = extractAlexandriaContent(alexandriaHtml);
      if (content && content.trim().length > 100) return content;
    }
  }

  const GALACTAPEDIA_CLASSES = ['rsi-article', 'article-content', 'text-content', 'article-body', 'content'];
  for (const cls of GALACTAPEDIA_CLASSES) {
    const content = findDivInnerHtml(html, cls);
    if (content && content.trim().length > 150) return cleanHtml(content);
  }

  const articleMatch = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (articleMatch && articleMatch[1].trim().length > 150) {
    return cleanHtml(articleMatch[1]);
  }

  logger.warn(`[rsi-scraper] could not extract galactapedia content from ${rsiUrl}`);
  return null;
}
