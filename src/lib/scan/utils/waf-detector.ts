/**
 * WAF (Web Application Firewall) detection.
 *
 * Extracted from the Phase 0 spike script. Detects Cloudflare, DataDome,
 * Akamai, PerimeterX, and generic WAF challenge pages based on HTML content,
 * page title, and HTTP status code.
 *
 * Key insight from Phase 0: DataDome and Cloudflare embed monitoring scripts
 * on real pages too. Only flag as WAF when HTML is small (< 10 KB) AND
 * contains WAF patterns. Large pages with WAF scripts are real content.
 */

export type WafType =
  | "cloudflare"
  | "datadome"
  | "akamai"
  | "perimeterx"
  | "generic"
  | "empty-shell";

export interface WafDetection {
  detected: boolean;
  type: WafType | null;
}

const BLOCKED_TITLE_RE =
  /access denied|attention required|just a moment|checking your browser|robot check|blocked|pardon our interruption|security check|please verify|one more step/i;

const CF_PATTERNS_RE = /cf-browser-verification|challenge-platform|cf-ray/i;
const AKAMAI_PATTERNS_RE = /akamai|access denied.*akamai/i;
const DATADOME_PATTERNS_RE = /captcha-delivery\.com|datadome.*device check/i;
const PERIMETERX_PATTERNS_RE = /perimeterx|px-captcha|human-challenge/i;
// HUMAN Security "Press & Hold" interactive challenge — overlays real page content,
// so the HTML is large and HTTP status is 200. Must match without size guards.
const HUMAN_INTERACTIVE_RE = /press\s*&amp;\s*hold|press\s+and\s+hold|robot or human\?|human-challenge.*press/i;

/**
 * Detect whether an HTML response is a WAF challenge page rather than
 * real site content.
 */
export function detectWaf(
  html: string,
  title: string,
  httpStatus: number,
): WafDetection {
  const lower = html.toLowerCase();
  const titleLower = title.toLowerCase();

  // DataDome keeps monitoring scripts on real pages — only flag as WAF
  // if the HTML is small (challenge page is ~1-2 KB, real pages are >> 10 KB)
  if (html.length < 10_000 && DATADOME_PATTERNS_RE.test(lower)) {
    return { detected: true, type: "datadome" };
  }

  // HUMAN Security interactive "Press & Hold" challenge — appears as an overlay
  // on top of real page content, so the HTML is large and status is 200.
  if (HUMAN_INTERACTIVE_RE.test(lower)) {
    return { detected: true, type: "perimeterx" };
  }

  // PerimeterX challenge pages (small HTML variant)
  if (html.length < 10_000 && PERIMETERX_PATTERNS_RE.test(lower)) {
    return { detected: true, type: "perimeterx" };
  }

  if (httpStatus === 403 || httpStatus === 503) {
    // Large pages with real titles are likely post-challenge redirects where
    // the initial goto status was 403 but the final page loaded successfully
    if (html.length > 10_000 && !BLOCKED_TITLE_RE.test(titleLower)) {
      return { detected: false, type: null };
    }
    if (CF_PATTERNS_RE.test(lower)) return { detected: true, type: "cloudflare" };
    if (AKAMAI_PATTERNS_RE.test(lower)) return { detected: true, type: "akamai" };
    return { detected: true, type: "generic" };
  }

  if (BLOCKED_TITLE_RE.test(titleLower)) {
    if (CF_PATTERNS_RE.test(lower)) return { detected: true, type: "cloudflare" };
    return { detected: true, type: "generic" };
  }

  if (lower.length < 5000 && CF_PATTERNS_RE.test(lower)) {
    return { detected: true, type: "cloudflare" };
  }

  return { detected: false, type: null };
}

/**
 * Check a BQL navigation result for WAF or empty shell pages.
 * Returns null if the page looks like real content.
 */
export function checkBqlNavigation(
  html: string,
  pageTitle: string,
  httpStatus: number,
): WafDetection | null {
  const waf = detectWaf(html, pageTitle, httpStatus);
  if (waf.detected) return waf;

  // Suspiciously small HTML with no title is likely an empty shell / SPA skeleton
  if (html.length < 1500 && !pageTitle) {
    return { detected: true, type: "empty-shell" };
  }

  return null;
}
