const runtimeApi = globalThis.browser ?? globalThis.chrome;

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== 'starvis') return;
  if (event.data?.type !== 'STARVIS_RSI_HANGAR_SYNC_REQUEST') return;

  runtimeApi.runtime.sendMessage(
    {
      type: 'STARVIS_RSI_HANGAR_SYNC_REQUEST',
      token: event.data.token,
      starvisOrigin: event.data.starvisOrigin,
      callbackPath: event.data.callbackPath,
    },
    (response) => {
      if (runtimeApi.runtime.lastError) {
        window.postMessage(
          {
            source: 'starvis-rsi-hangar-extension',
            type: 'STARVIS_RSI_HANGAR_SYNC_RESULT',
            success: false,
            error: runtimeApi.runtime.lastError.message,
          },
          window.location.origin,
        );
        return;
      }

      window.postMessage(
        {
          source: 'starvis-rsi-hangar-extension',
          type: 'STARVIS_RSI_HANGAR_SYNC_RESULT',
          success: !!response?.success,
          payload: response?.payload,
          error: response?.error,
        },
        window.location.origin,
      );
    },
  );
});
