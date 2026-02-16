import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";
import axe from "axe-core";
import { calculateGrade, GRADING_VERSION } from "@/lib/grading";
import {
  checkRateLimit,
  acquireConcurrencySlot,
  releaseConcurrencySlot,
} from "@/lib/rate-limit";
import { validateUrl } from "@/lib/url-validator";

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

// Cached CDN source for reuse across requests within the same serverless instance
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
    "Failed to load axe-core: bundled source was empty and all CDN fallbacks failed"
  );
}

// ---- Raw-violations size cap ------------------------------------------------
// Convex document fields have a 1 MB limit, and huge payloads also slow down
// the client.  We cap the serialised violations at 500 KB and progressively
// trim node arrays (keeping at least one node per rule) until it fits.
const MAX_RAW_VIOLATIONS_CHARS = 512_000; // 500 KB in characters

interface AxeNode {
  html?: string;
  target?: string[];
  failureSummary?: string;
  [key: string]: unknown;
}

interface AxeViolation {
  id: string;
  impact?: string;
  description?: string;
  help?: string;
  helpUrl?: string;
  tags?: string[];
  nodes: AxeNode[];
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
function truncateViolations(violations: AxeViolation[]): {
  serialized: string;
  truncated: boolean;
} {
  let serialized = JSON.stringify(violations);
  if (serialized.length <= MAX_RAW_VIOLATIONS_CHARS) {
    return { serialized, truncated: false };
  }

  // Deep-clone so we don't mutate the axe-core originals
  const trimmed: AxeViolation[] = JSON.parse(serialized);

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

    const keepCount = Math.max(1, Math.floor(trimmed[maxIdx].nodes.length / 2));
    trimmed[maxIdx].nodes = trimmed[maxIdx].nodes.slice(0, keepCount);
  }

  serialized = JSON.stringify(trimmed);
  return { serialized, truncated: true };
}

// Vercel Pro allows up to 60s for serverless functions
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // ---- Env-var guard (fail fast in production) ------------------------------
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.BROWSERLESS_TOKEN &&
    !process.env.BROWSERLESS_URL
  ) {
    return NextResponse.json(
      {
        error:
          "Server misconfiguration: BROWSERLESS_TOKEN (or BROWSERLESS_URL) is not set. " +
          "A cloud browser service is required in production. " +
          "Please add the variable in your hosting provider's environment settings.",
      },
      { status: 500 },
    );
  }

  try {
    // ---- Rate limit (per-IP, sliding window) --------------------------------
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    const { allowed, limit, remaining, reset } = await checkRateLimit(ip);

    if (!allowed) {
      const retryAfter = reset
        ? Math.ceil((reset - Date.now()) / 1000)
        : 3600;
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": String(remaining),
          },
        },
      );
    }

    // ---- Global concurrency guard -------------------------------------------
    const slotAcquired = await acquireConcurrencySlot();
    if (!slotAcquired) {
      return NextResponse.json(
        { error: "Too many scans in progress. Please try again in a moment." },
        { status: 503 },
      );
    }

    try {
      // ---- Request validation ------------------------------------------------
      const { url: rawUrl } = await request.json();

      if (!rawUrl) {
        return NextResponse.json(
          { error: "URL is required" },
          { status: 400 },
        );
      }

      // ---- SSRF protection ---------------------------------------------------
      // Resolve hostname, block non-http(s) schemes and private IPs in prod.
      // Local dev allows private IPs so you can scan localhost:3001 etc.
      const validation = await validateUrl(rawUrl);
      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.reason },
          { status: 400 },
        );
      }
      const url = validation.url;

      // Check if we should use Browserless (cloud or local)
      const browserlessToken = process.env.BROWSERLESS_TOKEN;
      const browserlessUrl = process.env.BROWSERLESS_URL;
      const isProduction = process.env.NODE_ENV === "production";

      let browser;

      if (browserlessUrl) {
        // Custom Browserless URL (e.g., local Docker instance)
        // For local: ws://localhost:3001
        // For cloud with custom endpoint: wss://your-endpoint.browserless.io
        const wsUrl = browserlessToken
          ? `${browserlessUrl}?token=${browserlessToken}`
          : browserlessUrl;
        browser = await chromium.connectOverCDP(wsUrl);
      } else if (isProduction && browserlessToken) {
        // Production: Connect to Browserless.io cloud
        browser = await chromium.connectOverCDP(
          `wss://chrome.browserless.io?token=${browserlessToken}`,
        );
      } else {
        // Local development: Launch local browser
        browser = await chromium.launch({ headless: true });
      }

      // Use a realistic viewport and user agent to avoid bot detection.
      // ignoreHTTPSErrors: sites with expired/self-signed certs should still
      // be scannable — we're auditing accessibility, not TLS configuration.
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1920, height: 1080 },
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        // Extra headers real browsers send
        extraHTTPHeaders: {
          "Accept-Language": "en-US,en;q=0.9",
          "Sec-CH-UA":
            '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          "Sec-CH-UA-Mobile": "?0",
          "Sec-CH-UA-Platform": '"macOS"',
        },
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

      try {
        // Navigate to URL - use "domcontentloaded" instead of "networkidle"
        // Complex sites like Amazon/Walmart never reach networkidle due to
        // constant analytics, ads, and real-time updates
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        // Wait for the page to be reasonably loaded
        // This gives dynamic content time to render without waiting for network idle
        await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {
          // Ignore load state timeout - proceed with what we have
        });

        // Additional wait for JS-heavy sites to render content
        await page.waitForTimeout(2000);

        // Grab the page title while we have the page loaded
        const pageTitle = await page.title().catch(() => "");

        // --- Detect WAF / bot-block pages ------------------------------------
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
          (httpStatus === 403 || httpStatus === 503) ||
          blockedTitlePatterns.test(pageTitle) ||
          (blockedBodyPatterns.test(bodyText) && bodyLength < 5000);

        if (looksBlocked) {
          await browser.close();
          return NextResponse.json({
            error:
              "This site's firewall blocked our scanner. The results would not reflect the real page.",
            blocked: true,
            pageTitle,
            httpStatus,
          }, { status: 403 });
        }

        // Inject axe-core into the page via evaluate (works regardless of CSP)
        const axeSource = await getAxeCoreSource();
        await page.evaluate(axeSource);

        // Curated list of rules that are stable and don't crash on complex sites
        // These avoid color analysis and complex DOM traversal that causes
        // toLowerCase errors
        const safeRules = [
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

        // Try full scan first, fall back to safe rules if it crashes
        // This gives complete results for simple sites, partial for complex ones
        let results;
        let usedSafeMode = false;

        // First attempt: full scan with all rules
        const fullScanResult = await page
          .evaluate(async () => {
            // @ts-expect-error axe is injected globally
            const axe = window.axe;
            axe.reset();
            return await axe.run(document.body, {
              resultTypes: ["violations"],
            });
          })
          .catch((error: Error) => {
            return { error: error.message };
          });

        if ("error" in fullScanResult && fullScanResult.error) {
          // Full scan failed — likely color-contrast on complex sites
          // Retry with safe rules only
          console.log(
            `Full scan failed (${fullScanResult.error}), retrying with safe rules...`,
          );

          results = await page
            .evaluate(async (rules: string[]) => {
              // @ts-expect-error axe is injected globally
              const axe = window.axe;
              axe.reset();

              try {
                return await axe.run(document.body, {
                  runOnly: {
                    type: "rule",
                    values: rules,
                  },
                  resultTypes: ["violations"],
                  // Disable element references to avoid serialization issues
                  elementRef: false,
                });
              } catch (e) {
                // Safe mode also failed — try minimal scan on main content
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
                        values: [
                          "image-alt",
                          "link-name",
                          "button-name",
                          "label",
                          "document-title",
                        ],
                      },
                      resultTypes: ["violations"],
                      elementRef: false,
                    });
                  } catch {
                    // Even minimal scan failed
                  }
                }

                // Return empty results with warning
                return {
                  violations: [],
                  _warning: "Site too complex for automated scanning",
                };
              }
            }, safeRules)
            .catch((error: Error) => {
              return { error: error.message, violations: [] };
            });

          usedSafeMode = true;
        } else {
          results = fullScanResult;
        }

        await browser.close();

        // Check if axe-core encountered an error
        if ("error" in results && results.error) {
          return NextResponse.json(
            {
              error: `Accessibility scan failed: ${results.error}`,
              partial: true,
            },
            { status: 500 },
          );
        }

        // Check for warning (site was too complex, returning empty results)
        const warning = "_warning" in results ? results._warning : null;

        // Count violations by severity
        const violations = {
          critical: 0,
          serious: 0,
          moderate: 0,
          minor: 0,
          total: results.violations.length,
        };

        results.violations.forEach((violation: { impact?: string }) => {
          if (violation.impact === "critical") violations.critical++;
          else if (violation.impact === "serious") violations.serious++;
          else if (violation.impact === "moderate") violations.moderate++;
          else violations.minor++;
        });

        // Calculate grade using hybrid algorithm
        const { score, grade } = calculateGrade(violations);

        // ---- Truncate raw violations if they exceed the 500 KB cap ----------
        const { serialized: rawViolations, truncated } = truncateViolations(
          results.violations as AxeViolation[],
        );

        // Return results with grading version for lazy recalc tracking
        return NextResponse.json({
          violations,
          letterGrade: grade,
          score,
          gradingVersion: GRADING_VERSION,
          rawViolations,
          // Indicate if we used safe mode (fell back to curated safe rules)
          safeMode: usedSafeMode,
          // Flag when node details were trimmed to fit the size cap
          ...(truncated && { truncated: true }),
          // Include page title if we got one
          ...(pageTitle && { pageTitle }),
          // Include warning if site was too complex for full scan
          ...(warning && { warning }),
        });
      } catch (error) {
        await browser.close();
        throw error;
      }
    } finally {
      // Always release the concurrency slot, even on error
      await releaseConcurrencySlot();
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
