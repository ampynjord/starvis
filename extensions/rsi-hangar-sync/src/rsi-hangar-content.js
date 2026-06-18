function textOf(node) {
  return node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function linesOf(node) {
  return (node?.textContent ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function cleanUrl(value) {
  if (!value) return null;
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return null;
  }
}

async function clickLoadMoreButtons() {
  for (let i = 0; i < 20; i += 1) {
    const button = [...document.querySelectorAll('button, a')].find(
      (node) => /load more|show more|voir plus/i.test(textOf(node)) && !isDisabled(node) && isVisible(node),
    );
    if (!button) break;
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

function isDisabled(node) {
  return !!node.disabled || node.getAttribute('aria-disabled') === 'true' || /\b(disabled|inactive)\b/i.test(String(node.className || ''));
}

function isVisible(node) {
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
}

function controlLabel(node) {
  return (textOf(node) || node.getAttribute('aria-label') || node.getAttribute('title') || node.getAttribute('rel') || '').trim();
}

function numericControls() {
  return [...document.querySelectorAll('button, a')]
    .filter((node) => isVisible(node) && !isDisabled(node))
    .filter((node) => /^\d+$/.test(controlLabel(node)));
}

function paginationRoot() {
  for (const numeric of numericControls()) {
    let node = numeric.parentElement;
    for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
      const controls = [...node.querySelectorAll('button, a')].filter((candidate) => isVisible(candidate));
      const pageNumbers = controls.filter((candidate) => /^\d+$/.test(controlLabel(candidate)));
      if (pageNumbers.length >= 2 && pageNumbers.length <= 20) return node;
    }
  }
  return null;
}

function findNextPageControl(visitedPages) {
  const root = paginationRoot();
  if (!root) return null;

  const controls = [...root.querySelectorAll('button, a')].filter((node) => isVisible(node) && !isDisabled(node));
  const numbered = controls
    .map((node) => ({ node, page: Number(controlLabel(node)) }))
    .filter((entry) => Number.isInteger(entry.page) && entry.page > 0)
    .sort((a, b) => a.page - b.page);
  const unvisitedNumber = numbered.find((entry) => !visitedPages.has(entry.page));
  if (unvisitedNumber) return { node: unvisitedNumber.node, page: unvisitedNumber.page };

  const next = controls.find((node) => /^(next|suivant|›|»|>)+$/i.test(controlLabel(node)));
  return next ? { node: next, page: null } : null;
}

async function clickNextPage(visitedPages) {
  const next = findNextPageControl(visitedPages);
  if (!next) return false;
  next.node.click();
  if (next.page) visitedPages.add(next.page);
  await new Promise((resolve) => setTimeout(resolve, 1400));
  return true;
}

function titleOfCard(card, index) {
  const titleNode = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="name"]');
  return textOf(titleNode) || linesOf(card)[0] || `RSI hangar item ${index + 1}`;
}

function looksLikeShipPledge(card, index) {
  const title = titleOfCard(card, index);
  const text = textOf(card);
  if (title.length < 3 || text.length < 8) return false;

  if (/^\s*(paint|paints|skin|livery|upgrade|upgrades|insurance|gear|item|items|poster|armor|weapon|ticket|coupon)\b/i.test(title)) {
    return false;
  }

  return /\bstandalone\s+(ships?|vehicles?)\b/i.test(title) || /^\s*(ships?|vehicles?)\s*[-:]/i.test(title);
}

function findCards() {
  const selectors = ['[class*="pledge"]', '[class*="hangar"] article', 'article', '.row'];
  const candidates = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
  return [...new Set(candidates)].filter((node, index) => looksLikeShipPledge(node, index));
}

function extractCard(card, index) {
  const image = card.querySelector('img');
  const link = card.querySelector('a[href]');
  const dataId = card.getAttribute('data-id') || card.getAttribute('data-pledge-id') || card.getAttribute('data-item-id');
  const title = titleOfCard(card, index);
  const text = textOf(card);
  const className = card.getAttribute('data-class-name') || card.getAttribute('data-ship-code') || null;
  const shipName = title.replace(/^\s*standalone\s+(ships?|vehicles?)\s*[-:]\s*/i, '').trim() || title;

  return {
    externalId: dataId || cleanUrl(link?.getAttribute('href')) || `${title}-${index}`,
    name: shipName,
    label: shipName,
    title,
    className,
    packageName: null,
    imageUrl: cleanUrl(image?.getAttribute('src')),
    url: cleanUrl(link?.getAttribute('href')),
    quantity: 1,
    raw: {
      text: text.slice(0, 2000),
      sourceUrl: window.location.href,
    },
  };
}

async function scrapeHangar() {
  if (!/robertsspaceindustries\.com/.test(window.location.hostname)) {
    throw new Error('Not on Roberts Space Industries');
  }
  if (!/\/account\/pledges/.test(window.location.pathname) || window.location.search) {
    window.location.href = 'https://robertsspaceindustries.com/account/pledges';
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  await clickLoadMoreButtons();
  const entries = [];
  const visitedSignatures = new Set();
  const visitedPages = new Set([1]);

  for (let pageIndex = 0; pageIndex < 25; pageIndex += 1) {
    await clickLoadMoreButtons();
    const cards = findCards();
    const signature = cards.map((card, index) => titleOfCard(card, index)).join('|') || `${window.location.href}:${pageIndex}`;
    if (visitedSignatures.has(signature)) break;
    visitedSignatures.add(signature);
    entries.push(...cards.map(extractCard));
    if (!(await clickNextPage(visitedPages))) break;
  }

  const unique = new Map();
  for (const entry of entries) {
    if (!unique.has(entry.externalId)) unique.set(entry.externalId, entry);
  }
  return [...unique.values()];
}

const runtimeApi = globalThis.browser ?? globalThis.chrome;
const usesPromiseApi = runtimeApi === globalThis.browser;

runtimeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'STARVIS_RSI_HANGAR_PING') {
    if (usesPromiseApi) return Promise.resolve({ success: true });
    sendResponse({ success: true });
    return false;
  }

  if (message?.type !== 'STARVIS_SCRAPE_RSI_HANGAR') return false;

  if (usesPromiseApi) {
    return scrapeHangar()
      .then((entries) => ({ success: true, entries }))
      .catch((error) => ({
        success: false,
        error: error instanceof Error ? error.message : 'Unable to scrape RSI hangar',
      }));
  }

  scrapeHangar()
    .then((entries) => sendResponse({ success: true, entries }))
    .catch((error) => sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unable to scrape RSI hangar' }));
  return true;
});
