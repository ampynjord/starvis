const runtimeApi = globalThis.browser ?? globalThis.chrome;
const usesPromiseApi = runtimeApi === globalThis.browser;
const RSI_HANGAR_URL = 'https://robertsspaceindustries.com/en/account/pledges';

function queryTabs(query) {
  if (usesPromiseApi) return runtimeApi.tabs.query(query);
  return new Promise((resolve) => runtimeApi.tabs.query(query, resolve));
}

function createTab(createProperties) {
  if (usesPromiseApi) return runtimeApi.tabs.create(createProperties);
  return new Promise((resolve) => runtimeApi.tabs.create(createProperties, resolve));
}

function updateTab(tabId, updateProperties) {
  if (usesPromiseApi) return runtimeApi.tabs.update(tabId, updateProperties);
  return new Promise((resolve) => runtimeApi.tabs.update(tabId, updateProperties, resolve));
}

function executeScript(injection) {
  if (!runtimeApi.scripting?.executeScript) return Promise.reject(new Error('Script injection is unavailable'));
  if (usesPromiseApi) return runtimeApi.scripting.executeScript(injection);
  return new Promise((resolve, reject) => {
    runtimeApi.scripting.executeScript(injection, (result) => {
      if (runtimeApi.runtime.lastError) {
        reject(new Error(runtimeApi.runtime.lastError.message));
        return;
      }
      resolve(result);
    });
  });
}

async function executeScriptResult(injection) {
  const results = await executeScript(injection);
  return results?.[0]?.result;
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      runtimeApi.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30_000);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
      clearTimeout(timer);
      runtimeApi.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    runtimeApi.tabs.onUpdated.addListener(listener);
  });
}

async function navigateTab(tabId, url) {
  const waitForComplete = waitForTabComplete(tabId);
  await updateTab(tabId, { url, active: false });
  await waitForComplete;
}

function isHangarTab(tab) {
  if (!tab.url) return false;
  try {
    const url = new URL(tab.url);
    return url.hostname === 'robertsspaceindustries.com' && /^\/(?:[a-z]{2}\/)?account\/pledges\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

async function findOrOpenHangarTab() {
  const tabs = await queryTabs({ url: 'https://robertsspaceindustries.com/*' });
  const tab = tabs.find(isHangarTab) ?? (await createTab({ url: RSI_HANGAR_URL, active: false }));
  if (!tab.id) throw new Error('Unable to open RSI hangar tab');
  if (tab.url !== RSI_HANGAR_URL) {
    await navigateTab(tab.id, RSI_HANGAR_URL);
  } else if (tab.status !== 'complete') {
    await waitForTabComplete(tab.id);
  }
  return tab.id;
}

async function scrapeHangarTab(tabId) {
  const result = await executeScriptResult({
    target: { tabId },
    func: scrapeHangarInPage,
  });
  return result;
}

async function scrapeHangarInPage() {
  const HANGAR_PATH = '/en/account/pledges';

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

  function controlLabel(node) {
    return (textOf(node) || node.getAttribute('aria-label') || node.getAttribute('title') || node.getAttribute('rel') || '').trim();
  }

  function pageUrl(page) {
    const url = new URL(HANGAR_PATH, window.location.origin);
    if (page > 1) url.searchParams.set('page', String(page));
    return url.toString();
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

  function findCards(root) {
    const selectors = ['[class*="pledge"]', '[class*="hangar"] article', 'article', '.row'];
    const candidates = selectors.flatMap((selector) => [...root.querySelectorAll(selector)]);
    return [...new Set(candidates)].filter((node, index) => looksLikeShipPledge(node, index));
  }

  function extractCard(card, index, sourceUrl) {
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
        sourceUrl,
      },
    };
  }

  async function fetchDocument(url) {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error(`RSI hangar page request failed (${response.status})`);
    const html = await response.text();
    return new DOMParser().parseFromString(html, 'text/html');
  }

  function pageNumbers(root) {
    return [...root.querySelectorAll('button, a')]
      .map((node) => Number(controlLabel(node)))
      .filter((page) => Number.isInteger(page) && page > 0 && page <= 50);
  }

  function maxPage(root) {
    return Math.max(1, ...pageNumbers(root));
  }

  try {
    if (!/robertsspaceindustries\.com/.test(window.location.hostname)) {
      throw new Error('Not on Roberts Space Industries');
    }

    const firstUrl = pageUrl(1);
    const firstDocument = await fetchDocument(firstUrl);
    const pages = maxPage(firstDocument);
    const entries = [];

    for (let page = 1; page <= pages; page += 1) {
      const url = pageUrl(page);
      const pageDocument = page === 1 ? firstDocument : await fetchDocument(url);
      const cards = findCards(pageDocument);
      entries.push(...cards.map((card, index) => extractCard(card, index, url)));
    }

    const unique = new Map();
    for (const entry of entries) {
      if (!unique.has(entry.externalId)) unique.set(entry.externalId, entry);
    }
    return { success: true, entries: [...unique.values()] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to scrape RSI hangar',
    };
  }
}

async function postToStarvis({ starvisOrigin, callbackPath, token, entries }) {
  const url = `${starvisOrigin}${callbackPath}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Starvis-RSI-Sync-Token': token,
    },
    body: JSON.stringify({ syncToken: token, entries }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Starvis sync failed (${response.status})`);
  return payload;
}

async function handleSyncRequest(message) {
  if (!message.token || !message.starvisOrigin || !message.callbackPath) throw new Error('Invalid Starvis sync request');
  const tabId = await findOrOpenHangarTab();
  const scrape = await scrapeHangarTab(tabId);
  if (!scrape?.success) throw new Error(scrape?.error || 'Unable to read RSI hangar');
  const payload = await postToStarvis({
    starvisOrigin: message.starvisOrigin,
    callbackPath: message.callbackPath,
    token: message.token,
    entries: scrape.entries ?? [],
  });
  return { success: true, payload };
}

runtimeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'STARVIS_RSI_HANGAR_SYNC_REQUEST') return false;

  if (usesPromiseApi) {
    return handleSyncRequest(message).catch((error) => ({
      success: false,
      error: error instanceof Error ? error.message : 'RSI hangar sync failed',
    }));
  }

  handleSyncRequest(message)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ success: false, error: error instanceof Error ? error.message : 'RSI hangar sync failed' });
    });

  return true;
});
