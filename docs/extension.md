# Chrome Extension

The A11y Garden Chrome extension is now the primary product surface. It scans
the current `http(s)` tab, stores the result locally in Chrome extension
IndexedDB, and opens a `chrome-extension://` result tab.

Core scans do not require an A11y Garden account or network access after the
scanner assets are installed. The v1 extension is local-only and does not call
A11y Garden servers.

## Current Scope

- Desktop Chrome
- Unpacked extension install
- Local result tabs and local history
- Local multi-engine scans with axe-core, HTML_CodeSniffer, and IBM ACE
- Optional screenshot capture
- Optional 390x844 mobile clone scan
- Markdown, AGENTS.md, JSON, screenshot, and ZIP exports
- Agent-ready fix guidance in local results and Markdown/AGENTS.md exports

Current non-goals:

- Safari or Firefox extension builds
- Public upload/share from extension results
- Extension account sync, hosted analysis, or remote processing

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

`extension/dist` is the install target for the unpacked extension. Do not point
Chrome at the source `extension/` directory.

After changing extension code, rebuild and reload:

```bash
npm run build:extension
```

Then click **Reload** for the unpacked extension in `chrome://extensions`.

## Agent Fix Guidance

Use the local Markdown report or AGENTS.md export as input for a coding agent.
The extension does not upload scan results, screenshots, selectors, rule
metadata, or history.

## Chrome Web Store Release

Build the upload ZIP:

```bash
npm run package:extension
```

The package is written to `extension/a11y-garden-v<version>.zip` with
`manifest.json` at the ZIP root. The full release checklist and submission
instructions live in `docs/chrome-web-store-v1.md`.

## Files That Matter

- `extension/manifest.json` - permissions, popup, commands, service worker
- `extension/background.js` - active-tab scan flow and local result creation
- `extension/db.js` - IndexedDB storage helpers
- `extension/shared.js` - grading, report, and AGENTS.md helpers
- `extension/result.html` / `result.js` / `result.css` - local result UI
- `extension/popup.html` / `popup.js` / `popup.css` - popup controls
- `extension/scan-main.js` - in-page scan runtime and finding normalization

## Troubleshooting

### Why does it fail on Chrome internal pages, extension pages, or the New Tab page?

The extension only scans regular `http(s)` pages. Chrome-managed pages are not
scannable targets.

### Why does mobile clone scanning ask for permission?

The current tab grant does not automatically apply to a new temporary tab.
Mobile clone scanning requests temporary origin access before opening the
390x844 clone window.

### Why did my changes not show up after editing extension code?

You need both steps:

1. Rebuild with `npm run build:extension`
2. Reload the unpacked extension in `chrome://extensions`

### Why is there no mobile screenshot when screenshot capture is enabled?

The v1 extension uses lean permissions. It captures the current tab screenshot
locally, but mobile clone screenshots are omitted so the extension does not need
all-sites screenshot access.
