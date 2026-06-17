const runtimeApi = globalThis.browser ?? globalThis.chrome;
const RSI_HANGAR_URL = 'https://robertsspaceindustries.com/account/pledges';

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

async function findOrOpenHangarTab() {
  const tabs = await runtimeApi.tabs.query({ url: 'https://robertsspaceindustries.com/account/pledges*' });
  const tab = tabs[0] ?? (await runtimeApi.tabs.create({ url: RSI_HANGAR_URL, active: false }));
  if (!tab.id) throw new Error('Unable to open RSI hangar tab');
  if (tab.status !== 'complete') await waitForTabComplete(tab.id);
  return tab.id;
}

function sendTabMessage(tabId, message) {
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

runtimeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'STARVIS_RSI_HANGAR_SYNC_REQUEST') return false;

  (async () => {
    if (!message.token || !message.starvisOrigin || !message.callbackPath) throw new Error('Invalid Starvis sync request');
    const tabId = await findOrOpenHangarTab();
    const scrape = await sendTabMessage(tabId, { type: 'STARVIS_SCRAPE_RSI_HANGAR' });
    if (!scrape?.success) throw new Error(scrape?.error || 'Unable to read RSI hangar');
    const payload = await postToStarvis({
      starvisOrigin: message.starvisOrigin,
      callbackPath: message.callbackPath,
      token: message.token,
      entries: scrape.entries ?? [],
    });
    sendResponse({ success: true, payload });
  })().catch((error) => {
    sendResponse({ success: false, error: error instanceof Error ? error.message : 'RSI hangar sync failed' });
  });

  return true;
});
