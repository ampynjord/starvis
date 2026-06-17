function textOf(node) {
  return node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
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
      (node) => /load more|show more|next|voir plus|suivant/i.test(textOf(node)) && !node.disabled,
    );
    if (!button) break;
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

function findCards() {
  const selectors = ['[class*="pledge"]', '[class*="hangar"] article', '[class*="item"]', 'article', '.row'];
  const candidates = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
  return [...new Set(candidates)].filter((node) => {
    const text = textOf(node);
    if (text.length < 8) return false;
    return /ship|vehicle|standalone|upgrade|package|pledge|paint|insurance|aegis|anvil|origin|drake|misc|rsi|crusader|roberts/i.test(text);
  });
}

function extractCard(card, index) {
  const titleNode = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="name"]');
  const image = card.querySelector('img');
  const link = card.querySelector('a[href]');
  const dataId = card.getAttribute('data-id') || card.getAttribute('data-pledge-id') || card.getAttribute('data-item-id');
  const title = textOf(titleNode) || textOf(card).split(/\s{2,}|\n/)[0] || `RSI hangar item ${index + 1}`;
  const text = textOf(card);
  const className = card.getAttribute('data-class-name') || card.getAttribute('data-ship-code') || null;

  return {
    externalId: dataId || cleanUrl(link?.getAttribute('href')) || `${title}-${index}`,
    name: title,
    label: title,
    title,
    className,
    packageName: /package/i.test(text) ? title : null,
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
  if (!/\/account\/pledges/.test(window.location.pathname)) {
    window.location.href = 'https://robertsspaceindustries.com/account/pledges';
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  await clickLoadMoreButtons();
  const cards = findCards();
  const entries = cards.map(extractCard);
  const unique = new Map();
  for (const entry of entries) {
    if (!unique.has(entry.externalId)) unique.set(entry.externalId, entry);
  }
  return [...unique.values()];
}

const runtimeApi = globalThis.browser ?? globalThis.chrome;

runtimeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'STARVIS_SCRAPE_RSI_HANGAR') return false;
  scrapeHangar()
    .then((entries) => sendResponse({ success: true, entries }))
    .catch((error) => sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unable to scrape RSI hangar' }));
  return true;
});
