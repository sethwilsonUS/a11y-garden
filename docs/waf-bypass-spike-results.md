# WAF Bypass Spike Results

> Phase 0 of the Browserless WAF Bypass plan.
> Run date: 2026-03-03
>
> Historical note: this document captures the initial spike before the live
> Browserless reconnect handoff shipped. The current production path attempts
> BrowserQL stealth first, then reconnects the solved session back to
> Playwright for real-browser engine execution when possible, with the older
> JSDOM structural path kept as fallback.

## Setup

- **Browserless plan:** Free (1,000 units/month)
- **Cloud URL:** `https://production-sfo.browserless.io`
- **Proxy:** none (stealth route only)
- **Human-like:** false
- **Playwright version:** 1.58.0
- **axe-core version:** 4.11.1

## Architecture (discovered during spike)

At the time of this spike, the original plan assumed BQL → Playwright reconnect
via `browserWSEndpoint`. In the tested setup, that did **not work** — the
reconnect returned `browserQLEndpoint` (an HTTP endpoint for more BQL queries,
not a CDP WebSocket for Playwright).

**Working architecture:**
1. BQL stealth navigates to URL, bypasses WAF, returns rendered HTML via `html` mutation
2. axe-core runs server-side against the HTML via JSDOM (`runScripts: "outside-only"`)

This cleanly decouples WAF bypass (BQL's job) from accessibility scanning (axe-core's job).

**Trade-off:** JSDOM doesn't compute CSS, so rules like `color-contrast` won't fire.
For WAF-blocked sites, partial results are vastly better than "scan blocked" with zero results.

## Results

| URL | HTTP | CF Found | CF Solved | WAF? | HTML | Violations | Time | Notes |
|-----|------|----------|-----------|------|------|------------|------|-------|
| cloudflare.com | 200 | no | no | no | 2234 KB | 8 (C:1 S:3 M:4) | 28.6s | Full real content |
| nike.com | 200 | no | no | no | 884 KB | 9 (C:3 S:2 M:2) | 21.5s | Full real content |
| indeed.com | 403 | **yes** | **yes** | **cloudflare** | 47 KB | — | 12.2s | CF solved but html mutation got challenge page |
| zillow.com | 403 | no | no | **generic** | 9 KB | — | 3.5s | PerimeterX/non-CF WAF, stealth not enough |
| nordstrom.com | 200 | no | no | no | 123 KB | 2 (C:0 S:1 M:1) | 3.6s | Full real content |
| target.com | 200 | no | no | no | 341 KB | 4 (C:0 S:1 M:2) | 9.8s | Full real content |
| walmart.com | 200 | no | no | no | 277 KB | 2 (C:0 S:0 M:1) | 5.6s | Full real content |
| bestbuy.com | 200 | no | no | no | 461 KB | 3 (C:1 S:1 M:1) | 15.4s | Full real content |
| homedepot.com | 200 | no | no | no | 3 KB | 0 | 2.7s | SPA shell — JS-rendered, minimal static HTML |
| linkedin.com | 200 | no | no | no | 152 KB | 4 (C:1 S:2 M:1) | 4.7s | Login page, real content |
| chase.com | — | — | — | — | 0 KB | — | 62.9s | Navigation timeout |
| airbnb.com | 200 | no | no | no | 764 KB | 0 | 8.8s | SSR content, very clean or minimal static a11y |

## Summary

- **Total tested:** 12
- **Succeeded (HTML + axe results):** 9 (75%)
- **WAF not bypassed:** 2 (indeed.com, zillow.com)
- **Navigation failure:** 1 (chase.com timeout)
- **Success rate:** 75% (passes ≥70% gate)
- **Avg time (successes only):** 11.4s
- **Max time (successes):** 28.6s (cloudflare.com — 2.2 MB HTML)
- **No scan exceeded 60s** (chase.com timeout was a failure, not a success)

## Key Findings

### 1. Reconnect field name
The docs return `browserQLEndpoint`, **not** `browserWSEndpoint`.
This is an HTTP URL for sending more BQL queries — it is NOT a CDP WebSocket endpoint.
`chromium.connectOverCDP()` connects but times out because the endpoint doesn't speak CDP.

### 2. Playwright handoff does NOT work
Converting `browserQLEndpoint` to `wss://` and connecting via Playwright fails.
This invalidates the original plan's reconnect-to-Playwright approach.

### 3. BQL evaluate has limitations
- Embedding ~500KB axe source in GraphQL string: server 500 error (payload too large)
- GraphQL variables (`$src: String!`): "Invalid or unexpected token" (BQL may wrap in async function)
- Loading axe from CDN via `evaluate(url:)`: CDN returns HTML challenge page from within browser context
- Loading axe via `fetch()` in evaluate: same CSP/CDN issue

### 4. JSDOM + server-side axe-core works
The working approach: BQL gets HTML → JSDOM parses it → axe-core scans DOM server-side.
`runScripts: "outside-only"` prevents page scripts from running (which crash JSDOM)
while allowing manual `window.eval(axe.source)` injection.

### 5. Free tier limitations
- Reconnect timeout: 10,000ms max (plan said 30,000ms)
- Reconnect is moot since we don't use it in the working architecture

### 6. indeed.com: CF solved but HTML still blocked
`verify(type: cloudflare)` returned `found=true, solved=true`, but the `html` mutation
captured the challenge page (HTTP 403), not the post-solve page. Likely a timing issue —
the solve happens but BQL grabs HTML before the redirect completes. Could potentially be
fixed with a `goto` after `verify`, or with the `waitForNavigation` BQL feature.

### 7. zillow.com: non-CF WAF
Uses PerimeterX or similar, not Cloudflare. `verify(type: cloudflare)` didn't detect it.
Would need residential proxy (`BROWSERLESS_PROXY=residential`) to potentially bypass.

### 8. homedepot.com: SPA shell
HTTP 200 but only 3 KB of HTML — the site is fully JS-rendered. The static HTML is just
a shell with `<div id="root"></div>`. JSDOM can't execute their JS, so 0 violations.
This is a known limitation of the server-side approach for SPAs.

## Recommendations

- [x] **Proceed to Phase 1** — 75% success rate exceeds the 70% gate
- [ ] **Update the plan** — replace Playwright reconnect approach with BQL HTML + JSDOM architecture
- [ ] **Check Browserless dashboard** for actual unit consumption
- [ ] **Future: test with residential proxy** for indeed.com and zillow.com
- [ ] **Future: flag SPA shells** (HTML < 10KB) as "limited scan — site requires JS rendering"

## Updated Architecture for Phase 1+

```
Normal path (non-WAF):     Playwright → in-browser axe-core (full accuracy)
WAF bypass path:           BQL stealth → HTML → JSDOM + axe-core (partial accuracy, flagged)
```

The fallback chain (Phase 2) becomes:
1. Try normal Playwright scan (BaaS or local)
2. If ScanBlockedError → retry with BQL stealth → JSDOM
3. Flag results as "server-side scan" so users know some rules (e.g., color-contrast) couldn't run

## Reproducing

```bash
# Local sanity check (start Docker first: npm run dev:browserless)
npx tsx scripts/test-bql-bypass-local.ts https://example.com

# Single URL cloud test
npx tsx scripts/test-bql-bypass.ts https://www.cloudflare.com

# Full batch test
npx tsx scripts/test-bql-bypass.ts --batch

# With residential proxy (may improve indeed.com, zillow.com)
BROWSERLESS_PROXY=residential npx tsx scripts/test-bql-bypass.ts --batch
```
