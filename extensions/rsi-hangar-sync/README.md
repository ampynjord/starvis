# Starvis RSI Hangar Sync Extension

Browser extension used by the Fleet Manager `Sync` button.

The extension does not receive or store RSI credentials. It runs inside the user's browser session, opens the RSI hangar page, extracts hangar entries, then posts normalized data back to Starvis with a short-lived sync token created by the web app.

## Browser Builds

Build installable folders first:

```bash
npm run build --workspace=@starvis/rsi-hangar-sync-extension
```

- Chrome / Chromium: load `extensions/rsi-hangar-sync/dist/chrome`.
- Firefox: load `extensions/rsi-hangar-sync/dist/firefox/manifest.json` from `about:debugging#/runtime/this-firefox`.

Both manifests share the same `src/` files.

## Flow

1. Starvis Fleet Manager calls `POST /api/corp/fleet/rsi-sync/session`.
2. The page sends the returned sync token to the extension with `window.postMessage`.
3. The extension opens `https://robertsspaceindustries.com/account/pledges`.
4. From the RSI page context, the extension verifies the logged-in session and fetches `/en/account/pledges?page=N&pagesize=10` with the user's existing browser cookies.
5. It parses pledge item titles and kinds from every page, keeps only RSI `Ship`, `Spaceship`, and `Vehicle` entries, then sends them to `POST /api/corp/fleet/rsi-sync`.
6. The API mirrors entries whose source is `rsi_hangar`; manually declared ships are not removed.

Paints, gear, weapons, flair, subscriptions, and other non-ship hangar items are ignored before API matching. Upgraded pledges are imported from the RSI pledge item title, which is the ship currently owned after the upgrade.
