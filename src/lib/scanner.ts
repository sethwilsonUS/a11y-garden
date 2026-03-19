/**
 * Accessibility scanner engine
 *
 * Shared between the web API route and the CLI.
 * Uses Playwright + axe-core to scan web pages for accessibility violations.
 */

import { chromium } from "playwright";
import {
  FINDINGS_VERSION,
  type EngineProfile,
  type EngineSummary,
  type ViolationCounts,
} from "./findings";
import type { ScanModeInfo } from "./scan/strategies/types";
import { runEnginesOnPage } from "./scan/engines/orchestrator";

export {
  truncateViolations,
  type AxeViolationRaw,
  type ViolationCounts,
} from "./findings";

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

export interface ScanResult {
  violations: ViolationCounts;
  reviewViolations: ViolationCounts;
  rawFindings: string;
  findingsVersion: typeof FINDINGS_VERSION;
  engineProfile: EngineProfile;
  engineSummary: EngineSummary;
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
  /** Which engine profile to run. Defaults to "strict". */
  engineProfile?: EngineProfile;
  /** Viewport to scan. Defaults to "desktop". */
  viewport?: "desktop" | "mobile";
}

export interface ViewportScanResult {
  violations: ViolationCounts;
  reviewViolations: ViolationCounts;
  rawFindings: string;
  findingsVersion: typeof FINDINGS_VERSION;
  engineProfile: EngineProfile;
  engineSummary: EngineSummary;
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
export { PLATFORM_LABELS, PLATFORM_CONFIDENCE, getPlatformConfidence, detectPlatformFromHtml } from "./platforms";

/**
 * Detect the platform/CMS powering a page via Playwright.
 * Delegates to the shared `detectPlatformFromHtml` after pulling the DOM.
 */
async function detectPlatform(
  page: import("playwright").Page,
): Promise<string | undefined> {
  const { detectPlatformFromHtml } = await import("./platforms");
  const html = await page.content();
  const platform = detectPlatformFromHtml(html);

  if (!platform) {
    console.log(
      `[Platform] None detected. HTML starts with: ${html.substring(0, 300).toLowerCase()}...`,
    );
  }

  return platform;
}

export { type ScanModeInfo } from "./scan/strategies/types";

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
  const engineProfile = options.engineProfile ?? "strict";
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
    // HUMAN Security "Press & Hold" — overlays real content, large page, HTTP 200
    const humanInteractiveRe =
      /press & hold|press and hold|robot or human\?/i;

    const looksBlocked =
      httpStatus === 403 ||
      httpStatus === 503 ||
      blockedTitlePatterns.test(pageTitle) ||
      (blockedBodyPatterns.test(bodyText) && bodyLength < 5000) ||
      humanInteractiveRe.test(bodyText);

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

    const auditResult = await runEnginesOnPage(page, engineProfile);

    // Combine warnings (scan warnings + Docker rewrite notice)
    const combinedWarnings = [
      auditResult.warning,
      urlRewritten
        ? `URL rewritten from localhost to host.docker.internal for Docker-based browser.`
        : undefined,
    ]
      .filter(Boolean)
      .join(" ");

    return {
      violations: auditResult.violations,
      reviewViolations: auditResult.reviewViolations,
      rawFindings: auditResult.rawFindings,
      findingsVersion: auditResult.findingsVersion,
      engineProfile: auditResult.engineProfile,
      engineSummary: auditResult.engineSummary,
      pageTitle,
      safeMode: auditResult.scanModeInfo.mode !== "full",
      truncated: auditResult.truncated,
      scanModeInfo: auditResult.scanModeInfo,
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
  const engineProfile = options.engineProfile ?? "strict";
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
    const humanInteractiveRe2 =
      /press & hold|press and hold|robot or human\?/i;

    const looksBlocked =
      httpStatus === 403 ||
      httpStatus === 503 ||
      blockedTitlePatterns.test(pageTitle) ||
      (blockedBodyPatterns.test(bodyText) && bodyText.length < 5000) ||
      humanInteractiveRe2.test(bodyText);

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

    type ScreenshotResult = { screenshot?: Buffer; screenshotWarning?: string };
    const emptyShot: ScreenshotResult = {};

    const [desktopScan, mobileScan, desktopShot, mobileShot] = await Promise.all([
      runEnginesOnPage(desktopPage, engineProfile),
      runEnginesOnPage(mobilePage, engineProfile),
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
        violations: desktopScan.violations,
        reviewViolations: desktopScan.reviewViolations,
        rawFindings: desktopScan.rawFindings,
        findingsVersion: desktopScan.findingsVersion,
        engineProfile: desktopScan.engineProfile,
        engineSummary: desktopScan.engineSummary,
        safeMode: desktopScan.scanModeInfo.mode !== "full",
        truncated: desktopScan.truncated,
        scanModeInfo: desktopScan.scanModeInfo,
        ...(desktopShot.screenshot && { screenshot: desktopShot.screenshot }),
        ...(desktopShot.screenshotWarning && { screenshotWarning: desktopShot.screenshotWarning }),
        ...(desktopWarnings && { warning: desktopWarnings }),
      },
      mobile: {
        violations: mobileScan.violations,
        reviewViolations: mobileScan.reviewViolations,
        rawFindings: mobileScan.rawFindings,
        findingsVersion: mobileScan.findingsVersion,
        engineProfile: mobileScan.engineProfile,
        engineSummary: mobileScan.engineSummary,
        safeMode: mobileScan.scanModeInfo.mode !== "full",
        truncated: mobileScan.truncated,
        scanModeInfo: mobileScan.scanModeInfo,
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
