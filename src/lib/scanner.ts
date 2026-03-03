/**
 * Accessibility scanner engine
 *
 * Shared between the web API route and the CLI.
 * Uses Playwright + axe-core to scan web pages for accessibility violations.
 */

import { chromium } from "playwright";
import axe from "axe-core";
import type { ScanModeInfo } from "./scan/strategies/types";
import { SAFE_MODE_SKIPPED_CATEGORIES } from "./scan/rules/categories";

// ---------------------------------------------------------------------------
// axe-core source loading
// ---------------------------------------------------------------------------

// axe-core exposes its full JS source via the `source` property,
// designed for injection into browser pages (Selenium, Playwright, etc.).
// Using a standard import ensures the bundler traces and includes it in
// the serverless function bundle — no fs.readFileSync or path tricks needed.
const AXE_CORE_SOURCE: string = axe.source;

// CDN fallback URLs in case the bundled source is somehow empty
const AXE_CDN_URLS = [
  "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.11.1/axe.min.js",
  "https://unpkg.com/axe-core@4.11.1/axe.min.js",
];

// Cached CDN source for reuse across requests within the same process
let cachedCdnSource: string | null = null;

/**
 * Returns the axe-core JS source string for browser injection.
 * Primary: bundled via `axe.source` (works on Vercel, Docker, local).
 * Fallback: server-side fetch from CDN (avoids CSP issues vs page.addScriptTag).
 */
async function getAxeCoreSource(): Promise<string> {
  if (AXE_CORE_SOURCE) {
    return AXE_CORE_SOURCE;
  }

  if (cachedCdnSource) {
    return cachedCdnSource;
  }

  for (const cdnUrl of AXE_CDN_URLS) {
    try {
      const response = await fetch(cdnUrl);
      if (response.ok) {
        cachedCdnSource = await response.text();
        return cachedCdnSource;
      }
    } catch {
      // Try next CDN URL
    }
  }

  throw new Error(
    "Failed to load axe-core: bundled source was empty and all CDN fallbacks failed",
  );
}

// ---------------------------------------------------------------------------
// Raw-violations size cap
// ---------------------------------------------------------------------------
// Convex document fields have a 1 MB limit, and huge payloads also slow down
// the client.  We cap the serialised violations at 350 KB and progressively
// trim node arrays (keeping at least one node per rule) until it fits.

const MAX_RAW_VIOLATIONS_CHARS = 358_000; // 350 KB in characters

export interface AxeNodeRaw {
  html?: string;
  target?: string[];
  failureSummary?: string;
  [key: string]: unknown;
}

export interface AxeViolationRaw {
  id: string;
  impact?: string;
  description?: string;
  help?: string;
  helpUrl?: string;
  tags?: string[];
  nodes: AxeNodeRaw[];
  [key: string]: unknown;
}

/**
 * Shrink the violations payload to fit within MAX_RAW_VIOLATIONS_CHARS.
 *
 * Strategy: repeatedly halve the `nodes` array of whichever violation has the
 * most nodes, keeping at least one node per rule so every violation is still
 * represented.  Halving converges in O(log n) passes, so this is fast even
 * for very large result sets.
 */
export function truncateViolations(violations: AxeViolationRaw[]): {
  serialized: string;
  truncated: boolean;
} {
  let serialized = JSON.stringify(violations);
  if (serialized.length <= MAX_RAW_VIOLATIONS_CHARS) {
    return { serialized, truncated: false };
  }

  // Deep-clone so we don't mutate the axe-core originals
  const trimmed: AxeViolationRaw[] = JSON.parse(serialized);

  // Safety cap — halving converges fast; 50 passes handles absurd cases
  for (let pass = 0; pass < 50; pass++) {
    serialized = JSON.stringify(trimmed);
    if (serialized.length <= MAX_RAW_VIOLATIONS_CHARS) break;

    // Find the violation with the largest node array (>1 so we keep at least 1)
    let maxIdx = -1;
    let maxNodes = 1;
    for (let i = 0; i < trimmed.length; i++) {
      const count = trimmed[i].nodes?.length ?? 0;
      if (count > maxNodes) {
        maxNodes = count;
        maxIdx = i;
      }
    }

    if (maxIdx === -1) break; // every violation already has ≤1 node

    const keepCount = Math.max(
      1,
      Math.floor(trimmed[maxIdx].nodes.length / 2),
    );
    trimmed[maxIdx].nodes = trimmed[maxIdx].nodes.slice(0, keepCount);
  }

  serialized = JSON.stringify(trimmed);
  return { serialized, truncated: true };
}

// ---------------------------------------------------------------------------
// Docker localhost rewriting
// ---------------------------------------------------------------------------

/**
 * When scanning via a Docker-based remote browser (e.g. Browserless), URLs
 * targeting `localhost` / `127.x.x.x` / `[::1]` on the host machine won't
 * resolve — inside the container, `localhost` refers to the container itself.
 *
 * This helper rewrites the hostname to `host.docker.internal` which Docker
 * Desktop (macOS & Windows) and modern Linux Docker resolve to the host.
 *
 * Only applied when the WebSocket endpoint itself points to localhost (meaning
 * a local Docker container). Cloud Browserless endpoints are left alone.
 */

const LOCALHOST_RE = /^(localhost|127(?:\.\d+){3}|\[?::1\]?)$/i;

function isLocalWSEndpoint(wsEndpoint: string): boolean {
  try {
    // ws:// URLs can be parsed like http:// URLs for hostname extraction
    const url = new URL(wsEndpoint.replace(/^ws(s?):/, "http$1:"));
    return LOCALHOST_RE.test(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Rewrite localhost targets to `host.docker.internal` when scanning through a
 * local Docker-based browser. Returns the URL unchanged for non-local targets
 * or when no remote browser is in use.
 */
function rewriteLocalhostForDocker(
  targetUrl: string,
  wsEndpoint: string | undefined,
): { url: string; rewritten: boolean } {
  if (!wsEndpoint || !isLocalWSEndpoint(wsEndpoint)) {
    return { url: targetUrl, rewritten: false };
  }

  try {
    const parsed = new URL(targetUrl);
    if (LOCALHOST_RE.test(parsed.hostname)) {
      parsed.hostname = "host.docker.internal";
      return { url: parsed.toString(), rewritten: true };
    }
  } catch {
    // URL parsing failed — return unchanged
  }

  return { url: targetUrl, rewritten: false };
}

// ---------------------------------------------------------------------------
// Blank screenshot detection
// ---------------------------------------------------------------------------

/**
 * Heuristic check for blank (all-white or near-white) JPEG screenshots.
 *
 * JPEG files have a structured format, but decoding them fully would require
 * a library. Instead we use a fast heuristic: a blank white JPEG compresses
 * extremely well, so the file is very small relative to the viewport size
 * (1920×1080). Real web pages with text, images, and colour produce much
 * larger files even at quality 75.
 *
 * Threshold: a 1920×1080 all-white JPEG at q75 is typically 15-25 KB.
 * Anything under 30 KB is suspiciously blank.
 */
function isLikelyBlankScreenshot(buffer: Buffer, viewportWidth: number = 1920): boolean {
  // Mobile viewports produce much smaller JPEGs, so use a lower threshold.
  const threshold = viewportWidth <= 500 ? 8_000 : 30_000;
  return buffer.length < threshold;
}

// ---------------------------------------------------------------------------
// Viewport configs & stealth
// ---------------------------------------------------------------------------

const STEALTH_INIT_SCRIPT = () => {
  Object.defineProperty(navigator, "webdriver", { get: () => false });
  Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
  (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
};

export const DESKTOP_CONFIG = {
  viewport: { width: 1920, height: 1080 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 A11yGarden/1.0 (accessibility audit; +https://a11ygarden.com/about)",
  extraHTTPHeaders: {
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-CH-UA": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"macOS"',
  },
} as const;

export const MOBILE_CONFIG = {
  viewport: { width: 390, height: 844 },
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 A11yGarden/1.0 (accessibility audit; +https://a11ygarden.com/about)",
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  extraHTTPHeaders: {
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-CH-UA": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "Sec-CH-UA-Mobile": "?1",
    "Sec-CH-UA-Platform": '"iOS"',
  },
} as const;

// ---------------------------------------------------------------------------
// Custom error types
// ---------------------------------------------------------------------------

/** Thrown when a WAF / bot-block page is detected instead of the real site. */
export class ScanBlockedError extends Error {
  public readonly blocked = true;
  public readonly pageTitle: string;
  public readonly httpStatus: number;
  public readonly requiresAuth: boolean;

  constructor(
    message: string,
    pageTitle: string,
    httpStatus: number,
    requiresAuth = false,
  ) {
    super(message);
    this.name = "ScanBlockedError";
    this.pageTitle = pageTitle;
    this.httpStatus = httpStatus;
    this.requiresAuth = requiresAuth;
  }
}

// ---------------------------------------------------------------------------
// Scan result types
// ---------------------------------------------------------------------------

export interface ViolationCounts {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  total: number;
}

export interface ScanResult {
  violations: ViolationCounts;
  rawViolations: string;
  pageTitle: string;
  safeMode: boolean;
  truncated: boolean;
  warning?: string;
  /** JPEG screenshot of the page at scan time (only when captureScreenshot is true). */
  screenshot?: Buffer;
  /** Warning about the screenshot (e.g. appears blank). */
  screenshotWarning?: string;
  /** Detected website platform/CMS (e.g. "wordpress", "squarespace"). */
  platform?: string;
  /** Structured scan mode info (full, safe-rules, or jsdom-structural). */
  scanModeInfo?: ScanModeInfo;
}

export interface ScanOptions {
  /** WebSocket endpoint for a remote browser (e.g. Browserless). */
  browserWSEndpoint?: string;
  /** When true, capture a JPEG screenshot of the page before running axe-core. */
  captureScreenshot?: boolean;
  /** Viewport to scan. Defaults to "desktop". */
  viewport?: "desktop" | "mobile";
}

export interface ViewportScanResult {
  violations: ViolationCounts;
  rawViolations: string;
  safeMode: boolean;
  truncated: boolean;
  screenshot?: Buffer;
  screenshotWarning?: string;
  warning?: string;
  scanModeInfo?: ScanModeInfo;
}

export interface DualScanResult {
  desktop: ViewportScanResult;
  mobile: ViewportScanResult;
  pageTitle: string;
  platform?: string;
}

// ---------------------------------------------------------------------------
// Platform / CMS detection
// ---------------------------------------------------------------------------

// Re-export platform labels so consumers can import from either location
export { PLATFORM_LABELS, PLATFORM_CONFIDENCE, getPlatformConfidence } from "./platforms";

/**
 * Detect the platform/CMS powering a page.
 *
 * Uses `page.content()` to pull the full serialised HTML into Node.js
 * and pattern-matches server-side.  This avoids issues with
 * `page.evaluate` (SVGAnimatedString on className, cross-origin
 * stylesheet access errors, etc.) and makes the detection debuggable
 * via normal console.log.
 *
 * Detection signals are intentionally broad — enterprise/managed
 * hosting (e.g. WordPress VIP, Squarespace custom domains) often
 * strips the obvious markers, so we check multiple signals per
 * platform and match on *any*.
 */
async function detectPlatform(
  page: import("playwright").Page,
): Promise<string | undefined> {
  // Pull the full rendered HTML into Node.js for matching.
  // page.content() returns the serialised DOM including all script/link
  // tags, comments, data-attributes, and inline text — everything we need.
  const html = (await page.content()).toLowerCase();

  // Helper: find which pattern matched (returns the first match, or undefined).
  // Used both for the detection check and for debug logging.
  const matched = (...patterns: string[]) =>
    patterns.find((p) => html.includes(p));

  let platform: string | undefined;
  let signal: string | undefined;

  // ---- WordPress ----------------------------------------------------------
  // Standard installs expose wp-content/ and a generator meta tag.
  // Managed/VIP hosts (e.g. WordPress VIP used by TED, Time, etc.)
  // often strip those but still expose wp-json, wp-emoji, wp-block-*
  // classes, or "wordpress" in the page text.
  if (
    (signal = matched(
      'content="wordpress', "wp-content/", "wp-includes/",
      "wp-json", "wp-emoji", "wp-block-",
      "wordpress.com", "wpvip.com", "wordpress vip",
      "powered by wordpress",
    ))
  )
    platform = "wordpress";

  // ---- Drupal --------------------------------------------------------------
  else if (
    (signal = matched(
      'content="drupal', "drupal.js", "/sites/default/files",
      "drupal.org", "drupal.settings", "data-drupal-",
      "/core/misc/drupal.js", "/modules/system/",
      "views-row", "field-name-",
    ))
  )
    platform = "drupal";

  // ---- Joomla --------------------------------------------------------------
  else if (
    (signal = matched(
      'content="joomla', "/media/jui/", "/media/system/js/",
      "/components/com_", "/modules/mod_",
      "joomla!", "task=",
    ))
  )
    platform = "joomla";

  // ---- Ghost ---------------------------------------------------------------
  else if (
    (signal = matched(
      'content="ghost', "ghost.org", "ghost.io",
      "/ghost/api/", "ghost-portal", "ghost-search",
      "data-ghost-", "gh-head", "gh-portal",
      "powered by ghost",
    ))
  )
    platform = "ghost";

  // ---- Squarespace --------------------------------------------------------
  // Custom-domain sites serve assets from multiple CDNs:
  //   static1.squarespace.com, images.squarespace-cdn.com, sqsp.net
  // They also use sqs-* CSS classes, data-squarespace-* attributes,
  // and sometimes an HTML comment "This is Squarespace."
  else if (
    (signal = matched(
      "squarespace.com", "squarespace-cdn.com", "sqsp.net",
      "data-squarespace", "sqs-block", "sqs-layout",
      "sqs-announcement-bar", "sqs-slide-wrapper",
      "this is squarespace",
    ))
  )
    platform = "squarespace";

  // ---- Shopify -------------------------------------------------------------
  else if (
    (signal = matched(
      "cdn.shopify.com", "myshopify.com",
      "shopify.theme", "shopify-section",
      "shopify-payment", "shopify-features",
      "data-shopify", "shopify-app",
    ))
  )
    platform = "shopify";

  // ---- Wix -----------------------------------------------------------------
  else if (
    (signal = matched(
      "static.wixstatic.com", "parastorage.com",
      "wix.com", "wixsite.com",
      "x-wix-", "data-mesh-id",
      "wixui-", "wix-thunderbolt",
    ))
  )
    platform = "wix";

  // ---- Webflow -------------------------------------------------------------
  else if (
    (signal = matched(
      "webflow.com", "website-files.com",
      "wf-design", "w-webflow-badge",
      "data-wf-site", "data-wf-page",
    ))
  )
    platform = "webflow";

  // ---- HubSpot CMS ---------------------------------------------------------
  else if (
    (signal = matched(
      "js.hs-scripts.com", "hs-banner.com",
      ".hubspot.com", "hs-script-loader",
      "hubspot-topic", "hs-menu-wrapper",
      "data-hs-", "hs_cos_wrapper",
      "powered by hubspot",
    ))
  )
    platform = "hubspot";

  // ---- Weebly --------------------------------------------------------------
  else if (
    (signal = matched(
      "weebly.com", "editmysite.com",
      "wsite-", "weebly-",
      "data-wsite-", "weeblycloud.com",
      "powered by weebly",
    ))
  )
    platform = "weebly";

  // ---- Meta-frameworks (high confidence) -----------------------------------

  // Next.js
  else if (
    (signal = matched('id="__next"', "__next_css__", "/_next/", "_next/static"))
  )
    platform = "nextjs";

  // Nuxt
  else if (
    (signal = matched('id="__nuxt"', "__nuxt_page", "/_nuxt/", "nuxt.config"))
  )
    platform = "nuxt";

  // Gatsby
  else if (
    (signal = matched('id="___gatsby"', "/gatsby-", "gatsby-image", "gatsby-plugin"))
  )
    platform = "gatsby";

  // Angular
  else if (
    (signal = matched("ng-version=", "ng-app", "ng-controller", "_ngcontent-"))
  )
    platform = "angular";

  // Remix
  else if (
    (signal = matched('id="remix-"', "__remix", "remix-run", 'data-remix'))
  )
    platform = "remix";

  // Astro
  else if (
    (signal = matched("astro-island", "astro-slot", "data-astro-"))
  )
    platform = "astro";

  // ---- Base libraries (medium confidence) ----------------------------------

  // React (check after Next.js/Gatsby/Remix which use React internally)
  else if (
    (signal = matched("data-reactroot", "data-reactid", "__react"))
  )
    platform = "react";

  // Vue (check after Nuxt which uses Vue internally)
  else if (
    (signal = matched("data-v-", "__vue", "vue-app", 'id="app" data-v-'))
  )
    platform = "vue";

  // Svelte
  else if (html.match(/class="[^"]*svelte-[a-z0-9]/)) {
    signal = "svelte class pattern";
    platform = "svelte";
  }

  if (platform) {
    console.log(`[Platform] Detected: ${platform} (matched "${signal}")`);
  } else {
    // Log a snippet so we can diagnose missed detections.
    // Only the first 300 chars — enough to see the <head> generator tag area.
    console.log(
      `[Platform] None detected. HTML starts with: ${html.substring(0, 300)}...`,
    );
  }

  return platform;
}

// ---------------------------------------------------------------------------
// Curated safe rules
// ---------------------------------------------------------------------------

// Rules that are stable and don't crash on complex sites.
// These avoid color analysis and complex DOM traversal that causes
// toLowerCase errors on heavy pages.
const SAFE_RULES = [
  // Images
  "image-alt",
  "image-redundant-alt",
  "input-image-alt",
  "area-alt",
  // Forms
  "label",
  "form-field-multiple-labels",
  "select-name",
  "input-button-name",
  // Links & buttons
  "link-name",
  "button-name",
  // Document structure
  "document-title",
  "html-has-lang",
  "html-lang-valid",
  "valid-lang",
  "page-has-heading-one",
  "bypass",
  // Tables
  "td-headers-attr",
  "th-has-data-cells",
  "table-fake-caption",
  // Semantic structure
  "landmark-one-main",
  "region",
  "heading-order",
  "empty-heading",
  "duplicate-id",
  "duplicate-id-active",
  "duplicate-id-aria",
  // ARIA
  "aria-allowed-attr",
  "aria-hidden-body",
  "aria-hidden-focus",
  "aria-required-attr",
  "aria-required-children",
  "aria-required-parent",
  "aria-roles",
  "aria-valid-attr",
  "aria-valid-attr-value",
  // Focus & keyboard
  "tabindex",
  "focus-order-semantics",
  // Media
  "video-caption",
  "audio-caption",
  // Misc important ones
  "meta-viewport",
  "meta-refresh",
  "blink",
  "marquee",
  "server-side-image-map",
];

// ---------------------------------------------------------------------------
// ScanModeInfo builders
// ---------------------------------------------------------------------------

export { type ScanModeInfo } from "./scan/strategies/types";

function buildFullScanMode(rulesRun: number): ScanModeInfo {
  return { mode: "full", rulesRun, skippedCategories: [] };
}

function buildSafeRulesScanMode(
  rulesRun: number,
  errorMessage: string,
): ScanModeInfo {
  return {
    mode: "safe-rules",
    reason: `Full scan failed: ${errorMessage}. Fell back to safe rule subset.`,
    rulesRun,
    skippedCategories: SAFE_MODE_SKIPPED_CATEGORIES.map((c) => ({
      name: c.name,
      reason: c.reason,
      ruleIds: [...c.ruleIds],
    })),
  };
}

// ---------------------------------------------------------------------------
// Reusable helpers for scan functions
// ---------------------------------------------------------------------------

async function navigateAndWait(
  page: import("playwright").Page,
  url: string,
  isRemoteBrowser: boolean,
): Promise<import("playwright").Response | null> {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(isRemoteBrowser ? 3000 : 2000);
  return response;
}

async function capturePageScreenshot(
  page: import("playwright").Page,
  viewportWidth: number,
): Promise<{ screenshot?: Buffer; screenshotWarning?: string }> {
  try {
    let screenshot = await page.screenshot({
      type: "jpeg",
      quality: 75,
      fullPage: false,
    });

    if (screenshot && isLikelyBlankScreenshot(screenshot, viewportWidth)) {
      await page.waitForTimeout(4000);
      const retryScreenshot = await page.screenshot({
        type: "jpeg",
        quality: 75,
        fullPage: false,
      });
      if (retryScreenshot && !isLikelyBlankScreenshot(retryScreenshot, viewportWidth)) {
        screenshot = retryScreenshot;
      } else {
        return {
          screenshot,
          screenshotWarning:
            "Screenshot appears blank. The page may not have fully rendered " +
            "(e.g. client-side JS still loading, auth wall, or empty page).",
        };
      }
    }

    return { screenshot };
  } catch {
    return {};
  }
}

async function runAxeOnPage(
  page: import("playwright").Page,
  axeSource: string,
): Promise<{
  violations: ViolationCounts;
  rawViolations: string;
  safeMode: boolean;
  truncated: boolean;
  warning?: string;
  scanModeInfo: ScanModeInfo;
}> {
  await page.evaluate(axeSource);

  let results;
  let usedSafeMode = false;
  let fullScanError = "";

  const fullScanResult = await page
    .evaluate(async () => {
      // @ts-expect-error axe is injected globally
      const axe = window.axe;
      axe.reset();
      return await axe.run(document.body, { resultTypes: ["violations"] });
    })
    .catch((error: Error) => ({ error: error.message }));

  if ("error" in fullScanResult && fullScanResult.error) {
    fullScanError = fullScanResult.error;
    console.error(`Full scan failed (${fullScanError}), retrying with safe rules...`);

    results = await page
      .evaluate(async (rules: string[]) => {
        // @ts-expect-error axe is injected globally
        const axe = window.axe;
        axe.reset();
        try {
          return await axe.run(document.body, {
            runOnly: { type: "rule", values: rules },
            resultTypes: ["violations"],
            elementRef: false,
          });
        } catch (e) {
          console.error("Safe mode failed, trying minimal scan:", e);
          const mainEl =
            document.querySelector("main") ||
            document.querySelector("article") ||
            document.querySelector("#content") ||
            document.querySelector("#main");
          if (mainEl) {
            try {
              return await axe.run(mainEl, {
                runOnly: {
                  type: "rule",
                  values: ["image-alt", "link-name", "button-name", "label", "document-title"],
                },
                resultTypes: ["violations"],
                elementRef: false,
              });
            } catch { /* Even minimal scan failed */ }
          }
          return { violations: [], _warning: "Site too complex for automated scanning" };
        }
      }, SAFE_RULES)
      .catch((error: Error) => ({ error: error.message, violations: [] }));

    usedSafeMode = true;
  } else {
    results = fullScanResult;
  }

  if ("error" in results && results.error) {
    throw new Error(`Accessibility scan failed: ${results.error}`);
  }

  const warning = "_warning" in results ? (results._warning as string) : undefined;

  const violations: ViolationCounts = {
    critical: 0, serious: 0, moderate: 0, minor: 0,
    total: results.violations.length,
  };

  results.violations.forEach((violation: { impact?: string }) => {
    if (violation.impact === "critical") violations.critical++;
    else if (violation.impact === "serious") violations.serious++;
    else if (violation.impact === "moderate") violations.moderate++;
    else violations.minor++;
  });

  const { serialized: rawViolations, truncated } = truncateViolations(
    results.violations as AxeViolationRaw[],
  );

  const rulesRun = results.violations.length + (results.passes?.length ?? 0);
  const scanModeInfo = usedSafeMode
    ? buildSafeRulesScanMode(rulesRun, fullScanError)
    : buildFullScanMode(rulesRun);

  return {
    violations, rawViolations, safeMode: usedSafeMode, truncated,
    scanModeInfo,
    ...(warning && { warning }),
  };
}

// ---------------------------------------------------------------------------
// Main scan function
// ---------------------------------------------------------------------------

/**
 * Scan a URL for accessibility violations using Playwright + axe-core.
 *
 * @param url - The fully-qualified URL to scan
 * @param options - Optional scan configuration
 * @returns Scan results including violation counts and raw violations
 * @throws {ScanBlockedError} when the site's WAF blocks the scanner
 * @throws {Error} for general scan failures
 */
export async function scanUrl(
  url: string,
  options: ScanOptions = {},
): Promise<ScanResult> {
  // When scanning through a Docker-based remote browser, rewrite localhost
  // targets so the container can reach the host machine.
  const { url: effectiveUrl, rewritten: urlRewritten } =
    rewriteLocalhostForDocker(url, options.browserWSEndpoint);

  // Launch or connect to a browser
  const browser = options.browserWSEndpoint
    ? await chromium.connectOverCDP(options.browserWSEndpoint)
    : await chromium.launch({ headless: true });

  try {
    const isRemoteBrowser = !!options.browserWSEndpoint;
    const vpConfig = options.viewport === "mobile" ? MOBILE_CONFIG : DESKTOP_CONFIG;

    // Use a realistic viewport and user agent to avoid bot detection.
    // ignoreHTTPSErrors: sites with expired/self-signed certs should still
    // be scannable — we're auditing accessibility, not TLS configuration.
    // colorScheme is set explicitly so local Playwright and remote Browserless
    // always evaluate prefers-color-scheme identically.
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: vpConfig.viewport,
      colorScheme: "light",
      userAgent: vpConfig.userAgent,
      ...("isMobile" in vpConfig ? { isMobile: vpConfig.isMobile } : {}),
      ...("hasTouch" in vpConfig ? { hasTouch: vpConfig.hasTouch } : {}),
      ...("deviceScaleFactor" in vpConfig ? { deviceScaleFactor: vpConfig.deviceScaleFactor } : {}),
      extraHTTPHeaders: { ...vpConfig.extraHTTPHeaders },
    });
    const page = await context.newPage();

    // Stealth: mask common Playwright/automation signals before any navigation
    await page.addInitScript(() => {
      // Hide webdriver flag
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      // Fake plugins array (headless Chrome has none)
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      // Fake languages
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
      // Patch chrome runtime (missing in headless)
      (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
    });

    // Navigate to URL - use "domcontentloaded" instead of "networkidle"
    // Complex sites like Amazon/Walmart never reach networkidle due to
    // constant analytics, ads, and real-time updates
    const response = await page.goto(effectiveUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait for the page to be reasonably loaded
    // This gives dynamic content time to render without waiting for network idle
    await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {
      // Ignore load state timeout - proceed with what we have
    });

    // Additional wait for JS-heavy sites to render content.
    // Remote browsers (Docker/cloud) get extra time for network overhead
    // between the CDP commands and the actual page load.
    await page.waitForTimeout(isRemoteBrowser ? 3000 : 2000);

    // Grab the page title while we have the page loaded
    const pageTitle = await page.title().catch(() => "");

    // --- Detect platform / CMS ------------------------------------------------
    const platform = await detectPlatform(page).catch((err) => {
      console.error("[Platform] Detection failed:", err);
      return undefined;
    });

    // --- Detect WAF / bot-block pages ----------------------------------------
    // If we got a block page instead of the real site, the scan results
    // would be misleading (near-empty page → false A grade).
    const httpStatus = response?.status() ?? 200;
    const bodyText = await page
      .evaluate(() => document.body?.innerText?.substring(0, 2000) ?? "")
      .catch(() => "");
    const bodyLength = bodyText.length;

    const blockedTitlePatterns =
      /access denied|attention required|just a moment|checking your browser|robot check|blocked|pardon our interruption|please verify|security check|one more step/i;
    const blockedBodyPatterns =
      /captcha|cf-browser-verification|challenge-platform|akamai|perimeterx|datadome|cloudflare|enable javascript and cookies|unusual traffic/i;

    const looksBlocked =
      httpStatus === 403 ||
      httpStatus === 503 ||
      blockedTitlePatterns.test(pageTitle) ||
      (blockedBodyPatterns.test(bodyText) && bodyLength < 5000);

    if (looksBlocked) {
      throw new ScanBlockedError(
        "This site's firewall blocked our scanner. The results would not reflect the real page.",
        pageTitle,
        httpStatus,
      );
    }

    // --- Capture screenshot (before axe injection, shows what the scanner saw) ---
    let screenshot: Buffer | undefined;
    let screenshotWarning: string | undefined;
    if (options.captureScreenshot) {
      try {
        screenshot = await page.screenshot({
          type: "jpeg",
          quality: 75,
          fullPage: false, // viewport only — keeps file size reasonable (~200-400 KB)
        });

        // Detect blank/white screenshots — these happen when JS-heavy pages
        // haven't finished rendering yet (e.g. SPAs, pages behind auth).
        // Sample pixels from the raw JPEG buffer; if they're all near-white,
        // wait longer and retry once.
        if (screenshot && isLikelyBlankScreenshot(screenshot, vpConfig.viewport.width)) {
          // Retry: give the page more time to render
          await page.waitForTimeout(4000);
          const retryScreenshot = await page.screenshot({
            type: "jpeg",
            quality: 75,
            fullPage: false,
          });
          if (retryScreenshot && !isLikelyBlankScreenshot(retryScreenshot, vpConfig.viewport.width)) {
            screenshot = retryScreenshot;
          } else {
            // Still blank after retry — keep it but flag a warning
            screenshotWarning =
              "Screenshot appears blank. The page may not have fully rendered " +
              "(e.g. client-side JS still loading, auth wall, or empty page).";
          }
        }
      } catch {
        // Screenshot failure shouldn't block the scan
      }
    }

    // Run axe-core (full scan first, falls back to safe rules if it crashes)
    const axeSource = await getAxeCoreSource();
    const axeResult = await runAxeOnPage(page, axeSource);

    // Combine warnings (scan warnings + Docker rewrite notice)
    const combinedWarnings = [
      axeResult.warning,
      urlRewritten
        ? `URL rewritten from localhost to host.docker.internal for Docker-based browser.`
        : undefined,
    ]
      .filter(Boolean)
      .join(" ");

    return {
      violations: axeResult.violations,
      rawViolations: axeResult.rawViolations,
      pageTitle,
      safeMode: axeResult.safeMode,
      truncated: axeResult.truncated,
      scanModeInfo: axeResult.scanModeInfo,
      ...(combinedWarnings && { warning: combinedWarnings }),
      ...(screenshot && { screenshot }),
      ...(screenshotWarning && { screenshotWarning }),
      ...(platform && { platform }),
    };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Dual-viewport scan function
// ---------------------------------------------------------------------------

/**
 * Scan a URL at both desktop and mobile viewports in parallel.
 *
 * Uses a single browser connection with two contexts (works identically
 * for local Playwright and remote Browserless.io — both share one CDP session).
 *
 * Flow:
 *   1. Connect/launch browser
 *   2. Create desktop context, navigate, WAF check, platform detection
 *   3. Create mobile context, navigate
 *   4. Run axe + screenshot on both in parallel
 *   5. Return combined results
 */
export async function scanUrlDual(
  url: string,
  options: ScanOptions = {},
): Promise<DualScanResult> {
  const { url: effectiveUrl, rewritten: urlRewritten } =
    rewriteLocalhostForDocker(url, options.browserWSEndpoint);

  const browser = options.browserWSEndpoint
    ? await chromium.connectOverCDP(options.browserWSEndpoint)
    : await chromium.launch({ headless: true });

  try {
    const isRemoteBrowser = !!options.browserWSEndpoint;

    // ---- Desktop context (also serves as the WAF probe) ----------------------
    const desktopContext = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: DESKTOP_CONFIG.viewport,
      colorScheme: "light",
      userAgent: DESKTOP_CONFIG.userAgent,
      extraHTTPHeaders: { ...DESKTOP_CONFIG.extraHTTPHeaders },
    });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.addInitScript(STEALTH_INIT_SCRIPT);

    const desktopResponse = await navigateAndWait(desktopPage, effectiveUrl, isRemoteBrowser);

    // Grab page title from desktop
    const pageTitle = await desktopPage.title().catch(() => "");

    // Platform detection (once, on desktop)
    const platform = await detectPlatform(desktopPage).catch((err) => {
      console.error("[Platform] Detection failed:", err);
      return undefined;
    });

    // WAF check on desktop
    const httpStatus = desktopResponse?.status() ?? 200;
    const bodyText = await desktopPage
      .evaluate(() => document.body?.innerText?.substring(0, 2000) ?? "")
      .catch(() => "");

    const blockedTitlePatterns =
      /access denied|attention required|just a moment|checking your browser|robot check|blocked|pardon our interruption|please verify|security check|one more step/i;
    const blockedBodyPatterns =
      /captcha|cf-browser-verification|challenge-platform|akamai|perimeterx|datadome|cloudflare|enable javascript and cookies|unusual traffic/i;

    const looksBlocked =
      httpStatus === 403 ||
      httpStatus === 503 ||
      blockedTitlePatterns.test(pageTitle) ||
      (blockedBodyPatterns.test(bodyText) && bodyText.length < 5000);

    if (looksBlocked) {
      throw new ScanBlockedError(
        "This site's firewall blocked our scanner. The results would not reflect the real page.",
        pageTitle,
        httpStatus,
      );
    }

    // ---- Mobile context (only created after WAF check passes) ----------------
    const mobileContext = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: MOBILE_CONFIG.viewport,
      colorScheme: "light",
      userAgent: MOBILE_CONFIG.userAgent,
      isMobile: MOBILE_CONFIG.isMobile,
      hasTouch: MOBILE_CONFIG.hasTouch,
      deviceScaleFactor: MOBILE_CONFIG.deviceScaleFactor,
      extraHTTPHeaders: { ...MOBILE_CONFIG.extraHTTPHeaders },
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.addInitScript(STEALTH_INIT_SCRIPT);

    await navigateAndWait(mobilePage, effectiveUrl, isRemoteBrowser);

    // ---- Parallel: axe scan + screenshot on both viewports -------------------
    const axeSource = await getAxeCoreSource();

    type ScreenshotResult = { screenshot?: Buffer; screenshotWarning?: string };
    const emptyShot: ScreenshotResult = {};

    const [desktopScan, mobileScan, desktopShot, mobileShot] = await Promise.all([
      runAxeOnPage(desktopPage, axeSource),
      runAxeOnPage(mobilePage, axeSource),
      options.captureScreenshot
        ? capturePageScreenshot(desktopPage, DESKTOP_CONFIG.viewport.width)
        : Promise.resolve(emptyShot),
      options.captureScreenshot
        ? capturePageScreenshot(mobilePage, MOBILE_CONFIG.viewport.width)
        : Promise.resolve(emptyShot),
    ]);

    const dockerWarning = urlRewritten
      ? "URL rewritten from localhost to host.docker.internal for Docker-based browser."
      : undefined;

    const desktopWarnings = [desktopScan.warning, dockerWarning].filter(Boolean).join(" ");
    const mobileWarnings = [mobileScan.warning, dockerWarning].filter(Boolean).join(" ");

    return {
      desktop: {
        ...desktopScan,
        ...(desktopShot.screenshot && { screenshot: desktopShot.screenshot }),
        ...(desktopShot.screenshotWarning && { screenshotWarning: desktopShot.screenshotWarning }),
        ...(desktopWarnings && { warning: desktopWarnings }),
      },
      mobile: {
        ...mobileScan,
        ...(mobileShot.screenshot && { screenshot: mobileShot.screenshot }),
        ...(mobileShot.screenshotWarning && { screenshotWarning: mobileShot.screenshotWarning }),
        ...(mobileWarnings && { warning: mobileWarnings }),
      },
      pageTitle,
      ...(platform && { platform }),
    };
  } finally {
    await browser.close();
  }
}
