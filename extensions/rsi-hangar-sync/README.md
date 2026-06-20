# Starvis Browser Extension

Browser extension for Starvis web features. The first capability is the Fleet Manager RSI hangar `Sync` button.

The extension does not receive or store RSI credentials. It runs inside the user's browser session, opens the RSI hangar page, extracts hangar entries, then posts normalized data back to Starvis with a short-lived sync token created by the web app.

## Browser Builds And Store Packages

Build the browser extension folders and store upload archives:

```bash
npm run build --workspace=@starvis/rsi-hangar-sync-extension
```

- Local Chrome / Chromium development: load `extensions/rsi-hangar-sync/dist/chrome`.
- Local Firefox development: load `extensions/rsi-hangar-sync/dist/firefox/manifest.json` from `about:debugging#/runtime/this-firefox`.
- Chrome Web Store submission: upload `extensions/rsi-hangar-sync/dist/store/starvis-browser-extension-chrome.zip`.
- Firefox Add-ons submission: upload `extensions/rsi-hangar-sync/dist/store/starvis-browser-extension-firefox.zip`.

Both manifests share the same `src/` files and Starvis logo assets from `assets/`.

The store submission archives are generated from `dist/chrome-store` and `dist/firefox-store`; they only include production host permissions for `https://starvis.ampynjord.bzh/*` and `https://robertsspaceindustries.com/*`. The local development folders keep `localhost` and `127.0.0.1` permissions.

Firefox AMO requires a data collection declaration in the manifest. The Firefox package declares `websiteContent` because the extension reads RSI hangar page content in the user's authenticated browser session and transmits normalized hangar entries to Starvis for fleet synchronization. It does not receive or store RSI credentials.

In CI/CD, the `Build Extension` GitHub Actions job uploads those store packages as the `starvis-browser-extension-store-packages` artifact. Download that artifact from the run summary when submitting a new version to Chrome Web Store or Firefox Add-ons.

After both store listings are approved, configure the public install links:

- `NEXT_PUBLIC_STARVIS_EXTENSION_CHROME_STORE_URL`
- `NEXT_PUBLIC_STARVIS_EXTENSION_FIREFOX_STORE_URL`

The Fleet Manager `Install` menu uses those store URLs as the user installation path. Until both URLs are configured, it shows the store listings as pending instead of offering direct zip downloads.

## Flow

1. Starvis Fleet Manager calls `POST /api/corp/fleet/rsi-sync/session`.
2. The page sends the returned sync token to the extension with `window.postMessage`.
3. The extension opens `https://robertsspaceindustries.com/account/pledges`.
4. From the RSI page context, the extension verifies the logged-in session and fetches `/en/account/pledges?page=N&pagesize=10` with the user's existing browser cookies.
5. It parses pledge item titles and kinds from every page, keeps only RSI `Ship`, `Spaceship`, and `Vehicle` entries, then sends them to `POST /api/corp/fleet/rsi-sync`.
6. The API mirrors entries whose source is `rsi_hangar`; manually declared ships are not removed.

Paints, gear, weapons, flair, subscriptions, and other non-ship hangar items are ignored before API matching. Upgraded pledges are imported from the RSI pledge item title, which is the ship currently owned after the upgrade.
