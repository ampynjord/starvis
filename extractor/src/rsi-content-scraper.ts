/**
 * rsi-content-scraper.ts
 *
 * Fetches RSI comm-link and galactapedia pages and extracts the article HTML.
 * RSI pages are server-side rendered so a plain fetch() is sufficient.
 *
 * The extracted HTML is cleaned (scripts/styles removed, relative URLs made
 * absolute) and stored in the `content` column to replace the SC Wiki plain text.
 */

import logger from './logger.js';

const RSI_BASE = 'https://robertsspaceindustries.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; StarvisBot/1.0; +https://starvis.ampynjord.bzh)';
const REQUEST_TIMEOUT_MS = 15_000;

// ── HTML extraction ───────────────────────────────────────────────────────────

/**
 * Extracts the inner HTML of the first `<div>` element whose `class` attribute
 * contains `className` as a whole word. Handles arbitrary nesting depth by
 * counting div open/close tokens.
 */
function findDivInnerHtml(html: string, className: string): string | null {
  let searchFrom = 0;

  while (searchFrom < html.length) {
    // Find next <div ...>
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

    // Found the target div — now walk forward counting div depth
    let pos = contentStart;
    let depth = 1;

    while (pos < html.length && depth > 0) {
      const nextOpen = html.indexOf('<div', pos);
      const nextClose = html.indexOf('</div>', pos);

      if (nextOpen !== -1 && (nextClose === -1 || nextOpen < nextClose)) {
        // Peek ahead to confirm it's not a self-closing <div/>
        const peekClose = html.indexOf('>', nextOpen);
        if (peekClose !== -1 && html[peekClose - 1] !== '/') {
          depth++;
        }
        pos = nextOpen + 4;
      } else if (nextClose !== -1) {
        depth--;
        if (depth === 0) {
          return html.slice(contentStart, nextClose);
        }
        pos = nextClose + 6;
      } else {
        break;
      }
    }

    // Didn't find matching close — try next occurrence
    searchFrom = divOpen + 4;
  }

  return null;
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

/**
 * Remove attributes that aren't needed for display (class, id, data-*, style…)
 * while keeping: src, href, alt, title, width, height.
 */
function stripStylingAttributes(html: string): string {
  const KEEP = /^(src|href|alt|title|width|height|target|rel)$/i;
  return html.replace(/<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*)?)\s*>/g, (_full, tag, attrs) => {
    if (!attrs?.trim()) return `<${tag}>`;
    const kept = (attrs as string).replace(/\s+([a-zA-Z:_-]+)(?:="[^"]*"|='[^']*'|=[^\s>]*)?/g, (attrFull, attrName) => {
      return KEEP.test(attrName as string) ? attrFull : '';
    });
    return `<${tag}${kept}>`;
  });
}

function cleanHtml(raw: string): string {
  let html = removeNonContent(raw);
  html = absolutifyUrls(html);
  html = stripStylingAttributes(html);
  // Collapse excessive blank lines
  html = html.replace(/(\s*\n){3,}/g, '\n\n').trim();
  return html;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
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
 * Tries multiple known content container classes in order.
 */
export async function scrapeCommLinkContent(rsiUrl: string): Promise<string | null> {
  const html = await fetchHtml(rsiUrl);
  if (!html) return null;

  // RSI comm-links use .body-copy for the article body.
  // Fall back to .content-block → .article → <article> element.
  const COMM_LINK_CLASSES = ['body-copy', 'content-block', 'article-content', 'article-body', 'content'];

  for (const cls of COMM_LINK_CLASSES) {
    const content = findDivInnerHtml(html, cls);
    if (content && content.trim().length > 150) {
      return cleanHtml(content);
    }
  }

  // Last resort: try to grab the <article> element content
  const articleMatch = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (articleMatch && articleMatch[1].trim().length > 150) {
    return cleanHtml(articleMatch[1]);
  }

  logger.warn(`[rsi-scraper] could not extract comm-link content from ${rsiUrl}`);
  return null;
}

/**
 * Scrape the article body HTML from an RSI Galactapedia page.
 */
export async function scrapeGalactapediaContent(rsiUrl: string): Promise<string | null> {
  const html = await fetchHtml(rsiUrl);
  if (!html) return null;

  const GALACTAPEDIA_CLASSES = ['rsi-article', 'article-content', 'text-content', 'article-body', 'content'];

  for (const cls of GALACTAPEDIA_CLASSES) {
    const content = findDivInnerHtml(html, cls);
    if (content && content.trim().length > 150) {
      return cleanHtml(content);
    }
  }

  const articleMatch = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (articleMatch && articleMatch[1].trim().length > 150) {
    return cleanHtml(articleMatch[1]);
  }

  logger.warn(`[rsi-scraper] could not extract galactapedia content from ${rsiUrl}`);
  return null;
}
