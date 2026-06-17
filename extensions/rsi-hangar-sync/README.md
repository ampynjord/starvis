# Starvis RSI Hangar Sync Extension

Browser extension used by the Fleet Manager `Sync` button.

The extension does not receive or store RSI credentials. It runs inside the user's browser session, opens the RSI hangar page, extracts hangar entries, then posts normalized data back to Starvis with a short-lived sync token created by the web app.

## Browser Builds

- Chrome / Chromium: load `manifest.chrome.json`.
- Firefox: load `manifest.firefox.json`.

Both manifests share the same `src/` files.

## Flow

1. Starvis Fleet Manager calls `POST /api/corp/fleet/rsi-sync/session`.
2. The page sends the returned sync token to the extension with `window.postMessage`.
3. The extension opens `https://robertsspaceindustries.com/account/pledges`.
4. The RSI content script extracts hangar cards and sends them to `POST /api/corp/fleet/rsi-sync`.
5. The API mirrors entries whose source is `rsi_hangar`; manually declared ships are not removed.
