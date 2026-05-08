# Chrome Web Store v1 Submission Guide

Last reviewed: May 8, 2026

This guide is for publishing the A11y Garden Chrome extension v1. The extension
package is local-only: it scans the active tab, stores results in Chrome
extension storage, and exports local reports. The portfolio web app can keep its
server features; do not describe those as extension behavior in the store
listing.

Official references:

- [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare/)
- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish/)
- [Complete your listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing/)
- [Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Supplying images](https://developer.chrome.com/docs/webstore/images)
- [Configure extension icons](https://developer.chrome.com/docs/extensions/develop/ui/configure-icons)
- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)

## 1. Preflight

1. Confirm the v1 extension still has one purpose: scan the current page for
   accessibility findings and export local reports.
2. Run:

   ```bash
   npm run test:run -- extension/shared.test.ts
   npm run build:extension
   ```

3. Inspect `extension/dist/manifest.json`:
   - `manifest.json` must be at the ZIP root.
   - `host_permissions` should be absent.
   - `optional_host_permissions` should only contain `http://*/*` and
     `https://*/*` for the optional mobile clone scan.
   - `icons` and `action.default_icon` should point to PNG files.
4. Static-check the packaged extension:

   ```bash
   rg -n -g '!extension/dist/vendor/**' "fetch\\(|auth|Clerk|Convex|OpenAI|appOrigin|a11ygarden\\.org" extension/dist
   ```

   Expected: no matches. The extension should not call A11y Garden servers.

5. Load `extension/dist` unpacked in Chrome:
   - Open `chrome://extensions`.
   - Enable Developer mode.
   - Choose Load unpacked.
   - Select `extension/dist`.
   - Scan a normal `http(s)` page.
   - Verify the local result tab opens and exports Markdown, AGENTS.md, JSON,
     and ZIP files.

## 2. Build The Upload ZIP

Run:

```bash
npm run package:extension
```

The script builds `extension/dist` and writes
`extension/a11y-garden-v<version>.zip`, where `<version>` comes from
`extension/dist/manifest.json`. Upload that ZIP in the Chrome Web Store
Developer Dashboard. Do not zip the parent `extension/dist` folder itself; the
ZIP root must contain `manifest.json`.

The build copies the packaged scanner dependencies into
`extension/dist/vendor/`, including axe-core, HTML_CodeSniffer, IBM ACE, and
fflate. Load and upload `extension/dist` or the generated ZIP, not the source
`extension/` directory.

For every future upload, increment `version` in `extension/manifest.json`
before packaging. Chrome requires each uploaded version to be higher than the
previous uploaded version.

## 3. Developer Dashboard

1. Register a Chrome Web Store developer account from the
   [Developer Dashboard](https://chrome.google.com/webstore/devconsole/). Google
   requires a one-time registration fee and a developer email.
2. Click New item.
3. Upload `extension/a11y-garden-v<version>.zip`, matching the version in
   `extension/dist/manifest.json`.
4. Complete these tabs:
   - Store listing
   - Privacy
   - Distribution
   - Test instructions, optional but recommended
5. Save often. Submit for review only after all required fields pass.

## 4. Store Listing Copy

Suggested short description:

```text
Run local accessibility scans on the current tab and export Markdown, AGENTS.md, JSON, and ZIP reports.
```

Suggested detailed description:

```text
A11y Garden scans the page you are already viewing and keeps the result local to your browser.

The extension runs axe-core, HTML_CodeSniffer, and IBM ACE in Chrome, then opens a local result tab with confirmed findings, needs-review signals, engine coverage, and export tools.

Use A11y Garden when you want quick accessibility evidence for a page you can already access, including signed-in app screens and local development work. Reports can be exported as Markdown, AGENTS.md, audit JSON, or a ZIP bundle so you can hand the findings to a coding agent or developer.

Privacy posture:
- No account is required.
- No scan result is uploaded by the extension.
- Results and history remain in Chrome extension storage.
- Exports are downloaded to your device only when you choose a Markdown,
  AGENTS.md, JSON, or ZIP download.
- The extension does not capture screenshots.
- Mobile clone scanning asks for temporary site access only when you enable that option.

Automated accessibility checks are useful signals, not a complete WCAG audit. Always verify important fixes with keyboard testing, browser accessibility tooling, and screen reader checks where possible.
```

Recommended category: Developer Tools.

Suggested homepage/support URL: use the public A11y Garden page if it accurately
describes the local-only extension. If the page still talks about extension AI,
update that page first or leave the optional homepage field blank.

## 5. Graphic Assets

Required assets:

- Store icon: 128x128 PNG. Use `extension/icons/icon-128.png`.
- Screenshots: at least one 1280x800 screenshot, up to five.
- Small promo tile: 440x280 PNG or JPEG. A starter tile is available at
  `docs/store-assets/a11y-garden-promo-440x280.png`.

Recommended screenshot set:

1. Popup on a scannable page with scan options visible.
2. Local result overview with severity totals and export toolbar.
3. Expanded finding details showing rule ID, selector, WCAG metadata, and rule
   reference.
4. Fix with an agent panel next to the local privacy note.
5. ZIP contents in Finder showing `a11y-report.md`, `AGENTS.md`, and
   `audit.json`.

Screenshot capture workflow:

1. Use a clean Chrome profile or window so personal tabs/bookmarks are not
   visible.
2. Load `extension/dist` unpacked.
3. Scan a public page you can safely show in store media.
4. Resize the browser window to a 16:10-ish shape. The store requires 1280x800
   screenshots; if your capture is larger, crop/export to 1280x800.
5. On macOS, press `Command+Shift+5`, choose Capture Selected Window or Capture
   Selected Portion, and save the PNG.
6. Rename screenshots in order, for example:
   - `store-01-popup.png`
   - `store-02-result-overview.png`
   - `store-03-finding-details.png`
   - `store-04-agent-panel.png`
7. Use Preview, Acorn, Pixelmator, Figma, or another image tool to crop/export
   each screenshot to exactly 1280x800.

Small promo tile guidance:

- Size: exactly 440x280.
- Prefer brand/product imagery over dense UI screenshots.
- Keep text minimal or absent.
- Make sure it still reads when shrunk.
- Use saturated brand colors and clear edges.

## 6. Privacy Tab

Suggested answers for the v1 extension:

- Single purpose: locally scan the current page for accessibility findings and
  export reports.
- Remote code: No. The extension uses scripts packaged in the extension ZIP.
- Data sale/ads: No.
- Data transfer to third parties: No extension scan data is transferred.
- User data collected: disclose website content or web browsing activity if the
  dashboard treats scanned page URL/title/findings as collected data, even
  though results and history are stored locally. The disclosure should say it is
  used only to provide the scan/report feature. Exported Markdown, AGENTS.md,
  JSON, and ZIP files are downloaded to the user's device only when the user
  initiates the export.
- Privacy policy URL: provide a public page that says:
  - scan URL, page title, findings, and local history are stored in Chrome
    extension storage;
  - exported Markdown, AGENTS.md, JSON, and ZIP files are saved to the user's
    device only when the user starts a download;
  - the extension does not capture screenshots;
  - the extension does not upload scan data;
  - users can delete local results from the result/history UI;
  - data is not sold, used for ads, or transferred to third parties;
  - optional mobile clone scanning requests temporary site access for that
    feature;
  - use of information complies with the Chrome Web Store User Data Policy,
    including Limited Use requirements.

Permission justifications:

- `activeTab`: grants temporary access to the page the user explicitly scans.
- `scripting`: injects packaged accessibility scanner scripts into the active
  tab or temporary mobile clone.
- `storage`: saves preferences, last-result metadata, and local scan history in
  Chrome extension storage/IndexedDB.
- Optional `http://*/*` and `https://*/*`: requested only when the user enables
  the mobile clone scan, so the extension can scan that same site in a temporary
  390x844 window.

## 7. Test Instructions For Reviewers

Suggested reviewer instructions:

```text
No account or server setup is required.

1. Install the extension.
2. Open any regular http(s) page, such as https://example.com.
3. Click the A11y Garden toolbar icon.
4. Click Scan Current Tab.
5. A local chrome-extension:// result tab should open.
6. Verify Download Markdown, Download AGENTS.md, Download ZIP, and Open Local History.
7. Optional: enable Mobile clone, approve Chrome's temporary site-access prompt, and verify the 390x844 scan result appears.

The extension is intentionally local-only. It does not require sign-in and does not call A11y Garden servers.
```

## 8. Submit And Maintain

1. In Distribution, choose Public for launch, or Unlisted/Private for a test
   release. All visibility levels still go through policy review.
2. Select regions. Use all regions unless there is a specific reason not to.
3. Submit for review.
4. Watch the developer email for review questions or policy issues.
5. For updates:
   - make code changes;
   - increment `extension/manifest.json` version;
   - run tests and `npm run package:extension`;
   - upload the new ZIP;
   - update listing/privacy text if behavior changed.

## 9. Release Checklist

- [ ] `npm run test:run -- extension/shared.test.ts`
- [ ] `npm run build:extension`
- [ ] `npm run package:extension`
- [ ] `extension/dist/manifest.json` has no server host permissions
- [ ] Packaged source has no server/auth calls
- [ ] Unpacked extension scans a normal page
- [ ] Mobile clone scan works after temporary site-access approval
- [ ] Markdown, AGENTS.md, JSON, and ZIP exports work
- [ ] Store screenshots are cropped/exported to 1280x800
- [ ] Small promo tile is 440x280
- [ ] Privacy policy page is public and matches the v1 behavior
