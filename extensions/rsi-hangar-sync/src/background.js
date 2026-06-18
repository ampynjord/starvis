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
        func: inspectHangarReadiness,
      });
      if (lastState?.ready) return;
    } catch {
      // The tab can briefly reject script injection while RSI is swapping documents.
    }
    await sleep(750);
  }

  const detail = lastState?.markerCount != null ? ` (${lastState.markerCount} pledge markers detected)` : '';
  throw new Error(`RSI hangar did not finish loading${detail}`);
}

function inspectHangarReadiness() {
  const text = document.body?.innerText ?? '';
  const markerCount = [...document.querySelectorAll('[class*="pledge"], [class*="hangar"], article, .row, [class*="item"]')].filter(
    (node) => /\b(attributed|created:|contains:|standalone)\b/i.test(node.textContent ?? ''),
  ).length;
  return {
    ready: document.readyState === 'complete' && /my hangar/i.test(text) && markerCount > 0,
    markerCount,
  };
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
  await applyStandaloneShipsFilter(tabId);
  await waitForHangarReady(tabId);
  const firstPage = await waitForScrapedHangarPage(tabId, 1, null);
  if (!firstPage?.success) return firstPage;

  const entries = [...(firstPage.entries ?? [])];
  let previousSignature = firstPage.signature ?? null;
  const pages = Math.min(Math.max(1, Number(firstPage.pages) || 1), 50);
  for (let page = 2; page <= pages; page += 1) {
    const url = new URL(RSI_HANGAR_URL);
    url.searchParams.set('page', String(page));
    await navigateTab(tabId, url.toString());
    await waitForHangarReady(tabId);
    const pageResult = await waitForScrapedHangarPage(tabId, page, previousSignature);
    if (!pageResult?.success) return pageResult;
    entries.push(...(pageResult.entries ?? []));
    previousSignature = pageResult.signature ?? previousSignature;
  }

  const unique = new Map();
  for (const entry of entries) {
    if (!unique.has(entry.externalId)) unique.set(entry.externalId, entry);
  }
  return { success: true, entries: [...unique.values()] };
}

async function applyStandaloneShipsFilter(tabId) {
  await executeScriptResult({
    target: { tabId },
    func: applyStandaloneShipsFilterInPage,
  }).catch(() => null);
}

async function applyStandaloneShipsFilterInPage() {
  const sleepInPage = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  const labelText = (node) =>
    (node?.textContent || node?.getAttribute?.('aria-label') || node?.getAttribute?.('title') || '').replace(/\s+/g, ' ').trim();
  const standalonePattern = /\bstandalone\s+ships?\b/i;

  const beforeSignature = document.body?.innerText?.slice(0, 2000) ?? '';
  for (const select of [...document.querySelectorAll('select')]) {
    const option = [...select.options].find((candidate) => standalonePattern.test(labelText(candidate)));
    if (!option) continue;
    if (select.value !== option.value) {
      select.value = option.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await sleepInPage(1600);
    }
    return { applied: true, mode: 'select' };
  }

  const controls = [...document.querySelectorAll('button, [role="button"], [aria-haspopup], .select, [class*="select"]')];
  const filterControl = controls.find((node) => /(^|\b)(all|game packages|upgrades|standalone ships)(\b|$)/i.test(labelText(node)));
  if (filterControl instanceof HTMLElement) {
    filterControl.click();
    await sleepInPage(500);
    const option = [...document.querySelectorAll('button, a, li, option, [role="option"], [class*="option"]')].find((node) =>
      standalonePattern.test(labelText(node)),
    );
    if (option instanceof HTMLElement) {
      option.click();
      await sleepInPage(1800);
      return {
        applied: true,
        mode: 'custom',
        changed: (document.body?.innerText?.slice(0, 2000) ?? '') !== beforeSignature,
      };
    }
  }

  return { applied: false };
}

async function waitForScrapedHangarPage(tabId, expectedPage, previousSignature) {
  let lastResult = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    lastResult = await scrapeVisibleHangarPage(tabId).catch((error) => ({
      success: false,
      error: error instanceof Error ? error.message : 'Unable to scrape RSI hangar',
    }));
    if (lastResult?.success) {
      const pageMatches = Number(lastResult.currentPage || 1) === expectedPage;
      const contentReady = (lastResult.pledgeCount ?? 0) > 0;
      const contentChanged = !previousSignature || lastResult.signature !== previousSignature;
      if (pageMatches && contentReady && contentChanged) return lastResult;
    }
    await sleep(750);
  }

  return lastResult?.success
    ? {
        success: false,
        error: `RSI hangar page ${expectedPage} did not finish rendering distinct pledge content`,
      }
    : lastResult;
}

async function scrapeVisibleHangarPage(tabId) {
  return executeScriptResult({
    target: { tabId },
    func: scrapeHangarInPage,
  });
}

function scrapeHangarInPage() {
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

  function titleOfCard(card, index) {
    const titleNode = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="name"]');
    return textOf(titleNode) || linesOf(card)[0] || `RSI hangar item ${index + 1}`;
  }

  function targetShipNameFromUpgradeText(value) {
    if (!value) return null;
    const clean = value.replace(/\s+/g, ' ').trim();
    const match =
      clean.match(/\bto\s+(.+?)\s+upgrade\b/i) ||
      clean.match(/\bupgrade\s*[-:]\s*.+?\s+to\s+(.+?)(?:\s+(?:attributed|created:|contains:)|$)/i) ||
      clean.match(/\bcontains:\s*(.+?)\s+upgrade\b/i);
    return match?.[1]
      ?.replace(/\b(warbond|standard edition|edition|ccu)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function containsLineShipName(card) {
    const containsLine = linesOf(card).find((line) => /^contains:/i.test(line));
    if (!containsLine) return null;
    const value = containsLine
      .replace(/^contains:\s*/i, '')
      .replace(/\s+and\s+\d+\s+items?$/i, '')
      .trim();
    if (!value || /\b(paint|paints|skin|livery|gear|item|items|weapon|armor|poster|display|envelope)\b/i.test(value)) return null;
    return targetShipNameFromUpgradeText(value) || value;
  }

  function forbiddenPledgeLabel(value) {
    return /^\s*(paint|paints|skin|livery|insurance|gear|item|items|poster|armor|weapon|ticket|coupon)\b/i.test(value);
  }

  function shipCandidateLabels(card, index) {
    const title = titleOfCard(card, index);
    const text = textOf(card);
    const labels = [
      targetShipNameFromUpgradeText(title),
      targetShipNameFromUpgradeText(text),
      containsLineShipName(card),
      /\bstandalone\s+(ships?|vehicles?)\b/i.test(title) || /\bstandalone\s+(ships?|vehicles?)\b/i.test(text)
        ? title.replace(/^\s*standalone\s+(ships?|vehicles?)\s*[-:]\s*/i, '').trim()
        : null,
      /^\s*(ships?|vehicles?)\s*[-:]/i.test(title) ? title.replace(/^\s*(ships?|vehicles?)\s*[-:]\s*/i, '').trim() : null,
    ]
      .map((value) => value?.replace(/\s+/g, ' ').trim())
      .filter((value) => value && value.length >= 3 && !forbiddenPledgeLabel(value));
    return [...new Set(labels)];
  }

  function looksLikePledgeCard(card) {
    const text = textOf(card);
    if (text.length < 8 || text.length > 5000) return false;
    if (!/\b(attributed|created:|contains:|standalone|upgrade)\b/i.test(text)) return false;
    return (text.match(/\bcreated:/gi)?.length ?? 0) <= 1;
  }

  function findPledgeCards(root) {
    const selectors = ['[class*="pledge"]', '[class*="hangar"] article', 'article', '.row', '[class*="item"]'];
    const candidates = selectors.flatMap((selector) => [...root.querySelectorAll(selector)]);
    const pledgeCandidates = [...new Set(candidates)].filter((node) => looksLikePledgeCard(node));
    return pledgeCandidates.filter((node) => !pledgeCandidates.some((other) => other !== node && other.contains(node)));
  }

  function extractCard(card, index, sourceUrl) {
    const image = card.querySelector('img');
    const link = card.querySelector('a[href]');
    const dataId = card.getAttribute('data-id') || card.getAttribute('data-pledge-id') || card.getAttribute('data-item-id');
    const title = titleOfCard(card, index);
    const text = textOf(card);
    const className = card.getAttribute('data-class-name') || card.getAttribute('data-ship-code') || null;
    const shipCandidates = shipCandidateLabels(card, index);
    const shipName = shipCandidates[0] || title;

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
        detectedShipName: shipName,
        rsiKind: shipCandidates.length > 0 ? 'ship_candidate' : 'pledge',
        shipCandidates,
        sourceUrl,
      },
    };
  }

  function pageNumbers(root) {
    return [...root.querySelectorAll('button, a')]
      .map((node) => Number(controlLabel(node)))
      .filter((page) => Number.isInteger(page) && page > 0 && page <= 50);
  }

  function maxPage(root) {
    return Math.max(1, ...pageNumbers(root));
  }

  function currentPage() {
    const page = Number(new URL(window.location.href).searchParams.get('page') || '1');
    return Number.isInteger(page) && page > 0 ? page : 1;
  }

  try {
    if (!/robertsspaceindustries\.com/.test(window.location.hostname)) {
      throw new Error('Not on Roberts Space Industries');
    }

    const pledgeCards = findPledgeCards(document);
    const cards = findPledgeCards(document);
    const signature = pledgeCards.map((card, index) => `${titleOfCard(card, index)}:${textOf(card).slice(0, 180)}`).join('|');
    return {
      success: true,
      currentPage: currentPage(),
      pages: maxPage(document),
      pledgeCount: pledgeCards.length,
      signature,
      entries: cards.map((card, index) => extractCard(card, index, window.location.href)),
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
