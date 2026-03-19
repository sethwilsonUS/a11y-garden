# Chrome Extension

The A11y Garden Chrome extension provides a desktop live-scan workflow for pages you are already viewing in Chrome. It runs as an unpacked extension, scans the current `http(s)` page in place, posts the results to A11y Garden, and opens a protected hosted private result in a new tab.

This is a supported dev and testing workflow right now. It is not in the Chrome Web Store yet.

## Current Scope

- Desktop Chrome
- Unpacked extension install
- Live scan of the current page as rendered in the browser
- Hosted private results on either local dev or production A11y Garden

Current non-goals:

- Chrome Web Store distribution
- Mobile Chrome support

## Install and Build

Build the extension bundle from the project root:

```bash
npm run build:extension
```

Then install it in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `extension/dist`

`extension/dist` is the install target for the unpacked extension. Do not point Chrome at the source `extension/` directory.

After changing extension code, rebuild and reload:

```bash
npm run build:extension
```

Then click **Reload** for the unpacked extension in `chrome://extensions`.

## Using the A11y Garden Origin

The popup includes an `A11y Garden origin` field. Use it to choose where hosted results are created:

- `http://localhost:3000` for local development
- `https://a11ygarden.org` for production

The extension can stay installed locally as an unpacked extension while pointing at production. Publishing to the Chrome Web Store is not required for that workflow.

## Production Backend Checklist

Before pointing the extension at `https://a11ygarden.org`, make sure production has:

- The deployed Next.js app running on `https://a11ygarden.org`
- `/api/extension/ingest` available on that same origin
- Convex configured in the deployed environment
- Results pages available on that same origin

If any of those are missing, the scan may run locally in the page but fail when saving the hosted private result.

## Files That Matter

These files are the main operational pieces of the extension:

- `extension/manifest.json` — permissions, popup, service worker, host permissions, and web-accessible resources
- `extension/background.js` — active-tab scan flow, ingest POST, result-tab open, and stored preferences
- `extension/popup.js` — popup UI behavior, selected mode, and `A11y Garden origin` handling
- `extension/scan-main.js` — in-page scan runtime for axe-core, HTML_CodeSniffer, and ACE normalization

## FAQ and Troubleshooting

### Can I keep using it unpacked against `a11ygarden.org`?

Yes. That is the intended short-term workflow until store distribution is worth doing.

### Do I need to publish it to test production?

No. You can keep the extension installed locally as an unpacked extension and point it at `https://a11ygarden.org`.

### Why does it fail on Chrome internal pages, extension pages, or the New Tab page?

The extension only scans regular `http(s)` pages. Chrome-managed pages are not scannable targets.

### Why did my changes not show up after editing extension code?

You need both steps:

1. Rebuild with `npm run build:extension`
2. Reload the unpacked extension in `chrome://extensions`

### What if the hosted result does not save?

Check these in order:

- The popup `A11y Garden origin` matches the environment you meant to use
- The target origin exposes `/api/extension/ingest`
- Convex is configured in that environment

### Does mobile Chrome work?

Not as a target for this extension today. The current extension is desktop-focused.

## Related Docs

- [README.md](../README.md) for the quick local install flow
