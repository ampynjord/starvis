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

  function isDisabled(node) {
    return (
      !!node.disabled || node.getAttribute('aria-disabled') === 'true' || /\b(disabled|inactive)\b/i.test(String(node.className || ''))
    );
  }

  function isVisible(node) {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
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

    const next = controls.find((node) => /^(next|suivant|\u203a|\u00bb|>)+$/i.test(controlLabel(node)));
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

  try {
    if (!/robertsspaceindustries\.com/.test(window.location.hostname)) {
      throw new Error('Not on Roberts Space Industries');
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
