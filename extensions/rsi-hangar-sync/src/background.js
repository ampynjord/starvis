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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

async function waitForHangarReady(tabId) {
  let lastState = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      lastState = await executeScriptResult({
        target: { tabId },
        func: inspectHangarSession,
      });
    } catch {
      // The tab can briefly reject script injection while RSI is swapping documents.
      await sleep(750);
      continue;
    }
    if (lastState?.blocked) throw new Error(lastState.error || 'RSI blocked hangar access');
    if (lastState?.ready) return;
    await sleep(750);
  }

  const detail = lastState?.status ? ` (last status: ${lastState.status})` : '';
  throw new Error(`RSI hangar session was not detected${detail}. Log in to RSI, let the pledges page finish loading, then retry Sync.`);
}

async function inspectHangarSession() {
  function looksLikeCloudflare(html) {
    return /\b(just a moment|attention required|cf-browser-verification|cloudflare)\b/i.test(html);
  }

  function looksLikeLoggedInHangar(html) {
    return /\b(my hangar|pledges|contains:|standalone ships?|js-pledge-name|list-items)\b/i.test(html);
  }

  try {
    if (!/robertsspaceindustries\.com$/i.test(window.location.hostname)) {
      return { ready: false, status: 'wrong-host' };
    }

    const response = await fetch('/en/account/pledges?page=1&pagesize=10', {
      credentials: 'include',
      headers: {
        Accept: 'text/html,application/xhtml+xml,*/*',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    const html = await response.text();
    if (looksLikeCloudflare(html)) return { ready: false, blocked: true, error: 'Cloudflare blocked RSI hangar access' };
    return { ready: response.ok && looksLikeLoggedInHangar(html), status: response.status };
  } catch (error) {
    return { ready: false, status: 'fetch-error', error: error instanceof Error ? error.message : 'RSI hangar session probe failed' };
  }
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
  await navigateTab(tabId, RSI_HANGAR_URL);
  await waitForHangarReady(tabId);
  return scrapeVisibleHangarPage(tabId);
}

async function scrapeVisibleHangarPage(tabId) {
  return executeScriptResult({
    target: { tabId },
    func: scrapeHangarInPage,
  });
}

async function scrapeHangarInPage() {
  const MAX_PAGES = 50;

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

  function normalizeText(value) {
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compactId(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
  }

  function looksLikeCloudflare(html) {
    return /\b(just a moment|attention required|cf-browser-verification|cloudflare)\b/i.test(html);
  }

  function looksLikeLoggedInHangar(html) {
    return /\b(my hangar|pledges|contains:|standalone ships?|js-pledge-name|list-items)\b/i.test(html);
  }

  function isShipKind(kind) {
    const clean = normalizeText(kind).toLowerCase();
    if (!clean) return false;
    if (/\b(paint|skin|livery|decal|gear|weapon|armor|flair|poster|display|envelope|subscription)\b/i.test(clean)) return false;
    return clean === 'ship' || clean === 'spaceship' || clean.includes('vehicle');
  }

  function pageUrl(page) {
    const url = new URL('/en/account/pledges', window.location.origin);
    url.searchParams.set('page', String(page));
    url.searchParams.set('pagesize', '10');
    return url;
  }

  async function fetchPledgesPage(page) {
    const url = pageUrl(page);
    const response = await fetch(url.toString(), {
      credentials: 'include',
      headers: {
        Accept: 'text/html,application/xhtml+xml,*/*',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    const html = await response.text();
    if (looksLikeCloudflare(html)) throw new Error('Cloudflare blocked RSI hangar access. Refresh RSI in the browser, then retry Sync.');
    if (!response.ok) throw new Error(`RSI hangar page ${page} returned ${response.status}`);
    if (page === 1 && !looksLikeLoggedInHangar(html)) throw new Error('RSI session was not detected. Log in to RSI, then retry Sync.');
    return { html, url: url.toString() };
  }

  function titleNodeOf(item) {
    return item.querySelector('.title, [class~="title"], [class*="title"], h1, h2, h3, h4, [class*="name"]');
  }

  function kindNodeOf(item) {
    return item.querySelector('.kind, [class~="kind"], [class*="kind"], [data-kind], [data-type]');
  }

  function pledgeContainerOf(item) {
    return (
      item.closest('[data-pledge-id], [data-id], [class*="pledge"], article, .row, [class*="list-item"]') ?? item.parentElement ?? item
    );
  }

  function packageTitleOf(container) {
    const title = container.querySelector('.js-pledge-name, [class*="pledge-name"], h1, h2, h3, h4, [class*="title"], [class*="name"]');
    return normalizeText(textOf(title));
  }

  function directDataValue(node, names) {
    for (const name of names) {
      const value = node?.getAttribute?.(name);
      if (value) return normalizeText(value);
    }
    return null;
  }

  function extractHangarItem(item, index, page, sourceUrl) {
    const title = normalizeText(textOf(titleNodeOf(item)) || directDataValue(item, ['data-title', 'data-name']));
    const kind = normalizeText(textOf(kindNodeOf(item)) || directDataValue(item, ['data-kind', 'data-type']));
    if (!title || !isShipKind(kind)) return null;

    const container = pledgeContainerOf(item);
    const link = item.querySelector('a[href]') ?? container.querySelector('a[href]');
    const image = item.querySelector('img') ?? container.querySelector('img');
    const packageTitle = packageTitleOf(container);
    const itemId = directDataValue(item, ['data-id', 'data-item-id', 'data-pledge-id', 'data-sku']);
    const pledgeId = directDataValue(container, ['data-id', 'data-pledge-id', 'data-item-id', 'data-sku']);
    const linkUrl = cleanUrl(link?.getAttribute('href'));
    const externalId = [pledgeId || linkUrl || `page-${page}`, itemId || `item-${index}`, compactId(title)]
      .filter(Boolean)
      .join('|')
      .slice(0, 160);

    return {
      externalId,
      name: title,
      label: title,
      title,
      className:
        directDataValue(item, ['data-class-name', 'data-ship-code']) ?? directDataValue(container, ['data-class-name', 'data-ship-code']),
      packageName: packageTitle || null,
      imageUrl: cleanUrl(image?.getAttribute('src') || image?.getAttribute('data-src')),
      url: linkUrl,
      quantity: 1,
      raw: {
        rsiKind: kind,
        rsiImportMethod: 'same_origin_pledge_items',
        packageTitle: packageTitle || null,
        sourceUrl,
        page,
        text: textOf(item).slice(0, 1200),
        shipCandidates: [title],
      },
    };
  }

  function parseTotalPages(html) {
    const numbers = [...html.matchAll(/[?&]page=(\d+)/gi)].map((match) => Number(match[1])).filter((page) => page > 0 && page <= MAX_PAGES);
    return Math.max(1, ...numbers);
  }

  function parsePledgesPage(html, page, sourceUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const candidates = [...doc.querySelectorAll('.list-items .item, [class*="pledge"] .item, article .item, .row .item, .item')];
    const itemNodes = [...new Set(candidates)].filter((node) => titleNodeOf(node) && kindNodeOf(node));
    const entries = itemNodes.map((item, index) => extractHangarItem(item, index, page, sourceUrl)).filter(Boolean);
    return {
      entries,
      totalPages: parseTotalPages(html),
      itemCount: itemNodes.length,
      signature: entries.map((entry) => `${entry.externalId}:${entry.name}`).join('|'),
    };
  }

  try {
    if (!/robertsspaceindustries\.com/.test(window.location.hostname)) {
      throw new Error('Not on Roberts Space Industries');
    }

    const entries = [];
    const signatures = [];
    let totalPages = 1;
    let parsedItems = 0;

    for (let page = 1; page <= Math.min(totalPages, MAX_PAGES); page += 1) {
      const fetched = await fetchPledgesPage(page);
      const parsed = parsePledgesPage(fetched.html, page, fetched.url);
      entries.push(...parsed.entries);
      signatures.push(parsed.signature);
      parsedItems += parsed.itemCount;
      totalPages = Math.max(totalPages, parsed.totalPages);
    }

    const unique = new Map();
    for (const entry of entries) {
      if (!unique.has(entry.externalId)) unique.set(entry.externalId, entry);
    }

    return {
      success: true,
      currentPage: 1,
      pages: totalPages,
      pledgeCount: parsedItems,
      signature: signatures.join('||'),
      entries: [...unique.values()],
    };
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
