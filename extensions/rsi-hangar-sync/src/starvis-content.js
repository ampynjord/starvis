const runtimeApi = globalThis.browser ?? globalThis.chrome;
const usesPromiseApi = runtimeApi === globalThis.browser;

function postResult(result) {
  window.postMessage(
    {
      source: 'starvis-rsi-hangar-extension',
      type: 'STARVIS_RSI_HANGAR_SYNC_RESULT',
      success: !!result?.success,
      payload: result?.payload,
      error: result?.error,
    },
    window.location.origin,
  );
}

function sendRuntimeMessage(message) {
  if (usesPromiseApi) {
    return runtimeApi.runtime.sendMessage(message);
  }

  return new Promise((resolve, reject) => {
    runtimeApi.runtime.sendMessage(message, (response) => {
      if (runtimeApi.runtime.lastError) {
        reject(new Error(runtimeApi.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== 'starvis') return;
  if (event.data?.type !== 'STARVIS_RSI_HANGAR_SYNC_REQUEST') return;

  sendRuntimeMessage({
    type: 'STARVIS_RSI_HANGAR_SYNC_REQUEST',
    token: event.data.token,
    starvisOrigin: event.data.starvisOrigin,
    callbackPath: event.data.callbackPath,
  })
    .then(postResult)
    .catch((error) => {
      postResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unable to contact Starvis RSI Sync extension',
      });
    });
});
