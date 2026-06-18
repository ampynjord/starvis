const runtimeApi = globalThis.browser ?? globalThis.chrome;
const usesPromiseApi = runtimeApi === globalThis.browser;
const RSI_HANGAR_URL = 'https://robertsspaceindustries.com/account/pledges';

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
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function reloadTab(tabId) {
  if (usesPromiseApi) {
    await runtimeApi.tabs.reload(tabId);
  } else {
    await new Promise((resolve) => runtimeApi.tabs.reload(tabId, resolve));
  }
  await waitForTabComplete(tabId);
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
    return url.hostname === 'robertsspaceindustries.com' && /\/account\/pledges\/?$/.test(url.pathname);
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

function sendTabMessage(tabId, message) {
  if (usesPromiseApi) return runtimeApi.tabs.sendMessage(tabId, message);

  return new Promise((resolve, reject) => {
    runtimeApi.tabs.sendMessage(tabId, message, (response) => {
      if (runtimeApi.runtime.lastError) {
        reject(new Error(runtimeApi.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function canReachHangarContentScript(tabId) {
  try {
    const response = await sendTabMessage(tabId, { type: 'STARVIS_RSI_HANGAR_PING' });
    return !!response?.success;
  } catch {
    return false;
  }
}

async function injectHangarContentScript(tabId) {
  await executeScript({
    target: { tabId },
    files: ['src/rsi-hangar-content.js'],
  });
  await sleep(250);
}

async function ensureHangarContentScript(tabId) {
  if (await canReachHangarContentScript(tabId)) return;

  try {
    await injectHangarContentScript(tabId);
    if (await canReachHangarContentScript(tabId)) return;
  } catch {
    // Firefox can refuse dynamic injection on some freshly restored tabs; reload falls back to manifest injection.
  }

  await reloadTab(tabId);
  await sleep(500);
  if (await canReachHangarContentScript(tabId)) return;

  try {
    await injectHangarContentScript(tabId);
    if (await canReachHangarContentScript(tabId)) return;
  } catch {
    // Surface a clearer error below.
  }

  throw new Error(
    'RSI hangar tab is open, but the Starvis extension content script did not load. Refresh the RSI Hangar tab and retry Sync.',
  );
}

async function scrapeHangarTab(tabId) {
  await ensureHangarContentScript(tabId);
  return sendTabMessage(tabId, { type: 'STARVIS_SCRAPE_RSI_HANGAR' });
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
