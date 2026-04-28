# Chrome Extension

The A11y Garden Chrome extension is now the primary product surface. It scans
the current `http(s)` tab, stores the result locally in Chrome extension
IndexedDB, and opens a `chrome-extension://` result tab.

Core scans do not require an A11y Garden account or network access after the
scanner assets are installed. AI insights are optional and require sign-in.

## Current Scope

- Desktop Chrome
- Unpacked extension install
- Local result tabs and local history
- Local multi-engine scans with axe-core, HTML_CodeSniffer, and IBM ACE
- Optional screenshot capture
- Optional 390x844 mobile clone scan
- Markdown, AGENTS.md, JSON, screenshot, and ZIP exports
- Authenticated AI insights through `a11ygarden.org`

Current non-goals:

- Chrome Web Store distribution
- Safari or Firefox extension builds
- Public upload/share from extension results
- BYOK AI keys

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

## AI Insights

AI is off by default. To use it:

1. Open the extension popup.
2. Enable AI requests.
3. Accept the AI terms.
4. Sign in at `/extension/auth` on the configured A11y Garden origin.
5. Generate AI insights from a local result tab.

The extension sends redacted findings only: rule IDs, severity, descriptions,
WCAG metadata, node counts, and selectors. It does not send screenshots or HTML
snippets.

## Files That Matter

- `extension/manifest.json` - permissions, popup, commands, service worker
- `extension/background.js` - active-tab scan flow and local result creation
- `extension/db.js` - IndexedDB storage helpers
- `extension/shared.js` - grading, redaction, report, and AGENTS.md helpers
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

### Why did AI insights fail?

Check these in order:

- You are signed in on the configured A11y Garden origin
- AI requests are enabled in the popup
- The AI terms checkbox is accepted
- The server has `OPENAI_API_KEY` configured
- The request has not hit the authenticated rate limit
