/**
 * BQL + JSDOM strategy for WAF-bypassed scans.
 *
 * Architecture:
 *   1. BQL stealth navigates to the URL and bypasses the WAF
 *   2. BQL returns the fully-rendered HTML
 *   3. axe-core runs server-side against the HTML via JSDOM
 *
 * Trade-off: JSDOM doesn't compute CSS, so rules like color-contrast won't
 * fire. For WAF-blocked sites, structural results >> zero results.
 *
 * The BQL path uses single viewport only — JSDOM has no renderer, so
 * "desktop" vs "mobile" viewport is meaningless. When called for mobile
 * viewport, returns cached desktop results.
 */

import { ScanBlockedError } from "@/lib/scanner";
import { detectPlatformFromHtml } from "@/lib/platforms";
import { runAxeOnHtml } from "../axe-jsdom";
import { STRUCTURAL_RULES, JSDOM_SKIPPED_CATEGORIES } from "../rules/categories";
import { checkBqlNavigation } from "../utils/waf-detector";
import { detectAdaptiveServing } from "../utils/adaptive-detect";
import type {
  ScanStrategy,
  ScanStrategyOptions,
  StrategyScanResult,
  ScanModeInfo,
} from "./types";

// ---------------------------------------------------------------------------
// BQL API types
// ---------------------------------------------------------------------------

interface BqlResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

interface BqlNavigateResult {
  html: string;
  pageTitle: string;
  httpStatus: number | null;
  screenshotBase64: string | null;
  mobileScreenshotBase64: string | null;
}

type PostGotoStrategy = "immediate" | "wait-nav" | "wait-nav-long";

interface EscalationStep {
  label: string;
  verify: boolean;
  proxy: boolean;
  humanlike: boolean;
  postGoto: PostGotoStrategy;
}

const ESCALATION_CHAIN: EscalationStep[] = [
  {
    label: "stealth + proxy",
    verify: false,
    proxy: true,
    humanlike: true,
    postGoto: "wait-nav",
  },
  {
    label: "stealth + proxy + extended wait",
    verify: false,
    proxy: true,
    humanlike: true,
    postGoto: "wait-nav-long",
  },
  {
    label: "stealth + proxy + Cloudflare verify",
    verify: true,
    proxy: true,
    humanlike: true,
    postGoto: "immediate",
  },
];

// ---------------------------------------------------------------------------
// BQL API
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1_000;

const DEFAULT_BQL_TIMEOUT_MS = 90_000;

async function callBql(
  query: string,
  token: string,
  cloudUrl: string,
  opts: { proxy: boolean; humanlike: boolean; timeoutMs?: number },
): Promise<BqlResponse> {
  const params = new URLSearchParams({ token });
  if (opts.proxy) {
    params.set("proxy", "residential");
    params.set("proxyCountry", process.env.BROWSERLESS_PROXY_COUNTRY ?? "us");
  }
  if (opts.humanlike) {
    params.set("humanlike", "true");
  }

  const endpoint = `${cloudUrl}/stealth/bql?${params}`;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_BQL_TIMEOUT_MS;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: {} }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.ok) {
      return (await res.json()) as BqlResponse;
    }

    const text = await res.text().catch(() => "(no body)");

    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `BQL authentication failed (HTTP ${res.status}). Check BROWSERLESS_TOKEN.`,
      );
    }

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      console.log(
        `[BQL] Rate limited (429) — retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    throw new Error(`BQL HTTP ${res.status}: ${text.substring(0, 300)}`);
  }

  throw new Error("BQL request failed after retries");
}

interface BqlQueryOptions {
  screenshot?: boolean;
  mobileDevice?: string;
}

const DESKTOP_VP = { width: 1920, height: 1080 };
const MOBILE_VP = { width: 390, height: 844 };

/**
 * Builds BQL GraphQL mutation. When `screenshot` is true and no `mobileDevice`
 * is set (i.e. desktop path), captures BOTH a desktop and mobile screenshot in
 * the same session using GraphQL aliases — zero extra BQL units.
 *
 * Sequence: set desktop viewport → navigate → desktop screenshot → get HTML →
 *           set mobile viewport → mobile screenshot.
 */
function buildBqlQuery(
  targetUrl: string,
  step: EscalationStep,
  queryOpts: BqlQueryOptions = {},
  stepTimeoutMs: number = 30_000,
): string {
  const isMobileDevice = !!queryOpts.mobileDevice;

  const preNav = isMobileDevice
    ? `\n  emulate(device: "${queryOpts.mobileDevice}") { time }`
    : queryOpts.screenshot
      ? `\n  desktopVp: viewport(width: ${DESKTOP_VP.width}, height: ${DESKTOP_VP.height}) { time }`
      : '';

  const desktopScreenshotLine = queryOpts.screenshot && !isMobileDevice
    ? '\n  desktopScreenshot: screenshot(fullPage: false, type: jpeg, quality: 90) { base64 }'
    : '';

  const mobileScreenshotLine = queryOpts.screenshot && !isMobileDevice
    ? `\n  mobileVp: viewport(width: ${MOBILE_VP.width}, height: ${MOBILE_VP.height}) { time }` +
      '\n  mobileScreenshot: screenshot(fullPage: false, type: jpeg, quality: 90) { base64 }'
    : '';

  const singleScreenshotLine = queryOpts.screenshot && isMobileDevice
    ? '\n  screenshot(fullPage: false, type: jpeg, quality: 90) { base64 }'
    : '';

  // Use ~40% of the step's time budget for the navigation wait, clamped to [8s, 20s]
  const navWaitMs = Math.max(8_000, Math.min(20_000, Math.floor(stepTimeoutMs * 0.4)));
  // Extended wait uses ~60% of the budget, clamped to [12s, 25s]
  const longWaitMs = Math.max(12_000, Math.min(25_000, Math.floor(stepTimeoutMs * 0.6)));

  if (step.postGoto === "wait-nav") {
    return `mutation GetHtml {${preNav}
  goto(url: "${targetUrl}", waitUntil: load) { status time }
  waitForNavigation(timeout: ${navWaitMs}, waitUntil: networkIdle) { time }${desktopScreenshotLine}
  html { html }${mobileScreenshotLine}${singleScreenshotLine}
}`;
  }

  if (step.postGoto === "wait-nav-long") {
    return `mutation GetHtml {${preNav}
  goto(url: "${targetUrl}", waitUntil: load) { status time }
  waitForNavigation(timeout: ${longWaitMs}, waitUntil: networkIdle) { time }${desktopScreenshotLine}
  html { html }${mobileScreenshotLine}${singleScreenshotLine}
}`;
  }

  if (step.verify) {
    return `mutation GetHtml {${preNav}
  goto(url: "${targetUrl}", waitUntil: domContentLoaded) { status time }
  verify(type: cloudflare) { found solved time }${desktopScreenshotLine}
  html { html }${mobileScreenshotLine}${singleScreenshotLine}
}`;
  }

  return `mutation GetHtml {${preNav}
  goto(url: "${targetUrl}", waitUntil: domContentLoaded) { status time }${desktopScreenshotLine}
  html { html }${mobileScreenshotLine}${singleScreenshotLine}
}`;
}

async function bqlGetHtml(
  targetUrl: string,
  step: EscalationStep,
  token: string,
  cloudUrl: string,
  queryOpts: BqlQueryOptions = {},
  stepTimeoutMs?: number,
): Promise<BqlNavigateResult> {
  let query = buildBqlQuery(targetUrl, step, queryOpts, stepTimeoutMs);
  let data: BqlResponse;

  try {
    data = await callBql(query, token, cloudUrl, {
      proxy: step.proxy,
      humanlike: step.humanlike,
      timeoutMs: stepTimeoutMs,
    });
  } catch (err) {
    if (step.verify) {
      query = buildBqlQuery(targetUrl, { ...step, verify: false }, queryOpts, stepTimeoutMs);
      data = await callBql(query, token, cloudUrl, {
        proxy: step.proxy,
        humanlike: step.humanlike,
        timeoutMs: stepTimeoutMs,
      });
    } else {
      throw err;
    }
  }

  if (data.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join("; "));
  }

  const d = data.data as Record<string, Record<string, unknown>> | undefined;
  const gotoResult = d?.goto as { status?: number } | undefined;
  const htmlResult = d?.html as { html?: string } | undefined;
  const html = htmlResult?.html ?? "";

  // Aliased screenshots (desktop path) or single screenshot (mobile device path)
  const desktopShot = d?.desktopScreenshot as { base64?: string } | undefined;
  const mobileShot = d?.mobileScreenshot as { base64?: string } | undefined;
  const singleShot = d?.screenshot as { base64?: string } | undefined;

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch?.[1]?.trim() ?? "";

  const hasDesktop = !!desktopShot?.base64;
  const hasMobile = !!mobileShot?.base64;
  const hasSingle = !!singleShot?.base64;
  console.warn(
    `[BQL] Response: html=${html.length}B, title="${pageTitle.slice(0, 50)}", ` +
    `screenshots: desktop=${hasDesktop ? `${desktopShot!.base64!.length}B` : "none"}, ` +
    `mobile=${hasMobile ? `${mobileShot!.base64!.length}B` : "none"}, ` +
    `single=${hasSingle ? `${singleShot!.base64!.length}B` : "none"}, ` +
    `BQL response keys: ${d ? Object.keys(d).join(", ") : "none"}`,
  );

  return {
    html,
    pageTitle,
    httpStatus: (gotoResult?.status as number) ?? null,
    screenshotBase64: desktopShot?.base64 ?? singleShot?.base64 ?? null,
    mobileScreenshotBase64: mobileShot?.base64 ?? null,
  };
}

// ---------------------------------------------------------------------------
// ScanModeInfo builder
// ---------------------------------------------------------------------------

function buildJsdomScanMode(rulesRun: number): ScanModeInfo {
  return {
    mode: "jsdom-structural",
    reason:
      "Site firewall required server-side scanning. CSS and interactive rules unavailable.",
    rulesRun,
    skippedCategories: JSDOM_SKIPPED_CATEGORIES.map((c) => ({
      name: c.name,
      reason: c.reason,
      ruleIds: [...c.ruleIds],
    })),
  };
}

// ---------------------------------------------------------------------------
// Strategy implementation
// ---------------------------------------------------------------------------

export class BqlJsdomStrategy implements ScanStrategy {
  name = "bql-jsdom";

  private token: string;
  private cloudUrl: string;

  /** Cache desktop fetch so mobile viewport can reuse or diff */
  private desktopCache: {
    url: string;
    html: string;
    result: StrategyScanResult;
    mobileScreenshot?: Buffer;
  } | null = null;

  constructor() {
    const token = process.env.BROWSERLESS_TOKEN;
    if (!token) {
      throw new Error("BqlJsdomStrategy requires BROWSERLESS_TOKEN to be set");
    }
    this.token = token;
    const rawCloudUrl =
      process.env.BROWSERLESS_CLOUD_URL ||
      "https://production-sfo.browserless.io";
    this.cloudUrl = rawCloudUrl
      .replace(/^wss:/, "https:")
      .replace(/^ws:/, "http:");
  }

  async scan(
    url: string,
    opts: ScanStrategyOptions,
  ): Promise<StrategyScanResult> {
    if (opts.viewport === "mobile" && this.desktopCache?.url === url) {
      return this.handleMobileViewport(url, opts);
    }

    const scanStart = Date.now();
    const fetchResult = await this.fetchHtml(url, opts.timeBudgetMs, {
      screenshot: opts.captureScreenshot,
    });

    // Retry if any screenshot is missing. BQL sometimes returns mobile but
    // not desktop (or vice versa) due to timing/render races.
    const needDesktop = opts.captureScreenshot && !fetchResult.screenshotBase64;
    const needMobile = opts.captureScreenshot && !fetchResult.mobileScreenshotBase64;

    if (needDesktop || needMobile) {
      const elapsed = Date.now() - scanStart;
      const remaining = opts.timeBudgetMs - elapsed;
      const missing = [needDesktop && "desktop", needMobile && "mobile"].filter(Boolean).join("+");
      if (remaining > 20_000) {
        console.warn(`[BQL] Screenshot(s) missing (${missing}) — retrying (${Math.round(remaining / 1000)}s remaining)`);
        const retryResult = await this.retryScreenshots(url, Math.min(remaining - 5_000, 60_000));
        if (retryResult) {
          if (needDesktop && retryResult.desktopBase64) {
            fetchResult.screenshotBase64 = retryResult.desktopBase64;
          }
          if (needMobile && retryResult.mobileBase64) {
            fetchResult.mobileScreenshotBase64 = retryResult.mobileBase64;
          }
        }
      } else {
        console.warn(`[BQL] Screenshot(s) missing (${missing}) but only ${Math.round(remaining / 1000)}s left — skipping retry`);
      }
    }

    const axeResult = await runAxeOnHtml(
      fetchResult.content,
      url,
      STRUCTURAL_RULES,
    );

    const screenshot = fetchResult.screenshotBase64
      ? Buffer.from(fetchResult.screenshotBase64, "base64")
      : undefined;

    const mobileScreenshot = fetchResult.mobileScreenshotBase64
      ? Buffer.from(fetchResult.mobileScreenshotBase64, "base64")
      : undefined;

    const platform = detectPlatformFromHtml(fetchResult.content);

    const result: StrategyScanResult = {
      violations: axeResult.violations,
      rawViolations: axeResult.rawViolations,
      truncated: axeResult.truncated,
      scanMode: buildJsdomScanMode(axeResult.rulesRun),
      pageTitle: fetchResult.pageTitle,
      screenshot,
      platform,
      warning:
        axeResult.violations.total === 0 && fetchResult.content.length < 10_000
          ? "Limited results — this site may render content via JavaScript. " +
            "The server-side scan could only check the page skeleton."
          : undefined,
    };

    this.desktopCache = { url, html: fetchResult.content, result, mobileScreenshot };
    return result;
  }

  private async handleMobileViewport(
    url: string,
    opts: ScanStrategyOptions,
  ): Promise<StrategyScanResult> {
    const cached = this.desktopCache!;
    const adaptive = detectAdaptiveServing(cached.html, url);

    if (!adaptive.detected) {
      return {
        ...cached.result,
        screenshot: cached.mobileScreenshot,
        warning:
          "Same as desktop — this site uses responsive design (same HTML for all viewports). " +
          "CSS-only layout differences not evaluated in server-side mode.",
      };
    }

    const remaining = opts.timeBudgetMs;
    if (remaining < 8_000) {
      return {
        ...cached.result,
        screenshot: cached.mobileScreenshot,
        warning:
          `Adaptive serving detected (${adaptive.reason}) but insufficient time for mobile scan. ` +
          "Using desktop results.",
      };
    }

    const mobileFetch = await this.fetchHtml(url, remaining, {
      screenshot: opts.captureScreenshot,
      mobileDevice: "iPhone 14",
    });

    const axeResult = await runAxeOnHtml(
      mobileFetch.content,
      url,
      STRUCTURAL_RULES,
    );

    const mobileScreenshot = mobileFetch.screenshotBase64
      ? Buffer.from(mobileFetch.screenshotBase64, "base64")
      : undefined;

    return {
      violations: axeResult.violations,
      rawViolations: axeResult.rawViolations,
      truncated: axeResult.truncated,
      scanMode: buildJsdomScanMode(axeResult.rulesRun),
      pageTitle: mobileFetch.pageTitle,
      screenshot: mobileScreenshot,
      warning: `Mobile-specific scan — ${adaptive.reason}`,
    };
  }

  /**
   * Escalate through BQL tiers with screenshots included in the query.
   * Screenshots add ~2-3s on top of navigation (which is 15-30s for WAF sites),
   * so including them avoids a costly second navigation through the WAF.
   */
  private async fetchHtml(
    url: string,
    timeBudgetMs: number,
    queryOpts: BqlQueryOptions = {},
  ): Promise<{ content: string; pageTitle: string; screenshotBase64: string | null; mobileScreenshotBase64: string | null }> {
    const deadline = Date.now() + timeBudgetMs;

    for (let i = 0; i < ESCALATION_CHAIN.length; i++) {
      const step = ESCALATION_CHAIN[i];
      const remaining = deadline - Date.now();

      if (remaining < 5_000) {
        throw new Error(
          "WAF bypass ran out of time before completing escalation chain",
        );
      }

      const stepsLeft = ESCALATION_CHAIN.length - i;
      const stepTimeout = Math.min(
        Math.floor((remaining - 3_000) / stepsLeft),
        DEFAULT_BQL_TIMEOUT_MS,
      );

      try {
        console.log(`[BQL] ${step.label} → ${url} (${Math.round(stepTimeout / 1000)}s budget)`);
        const nav = await bqlGetHtml(
          url,
          step,
          this.token,
          this.cloudUrl,
          queryOpts,
          stepTimeout,
        );

        const wafCheck = checkBqlNavigation(
          nav.html,
          nav.pageTitle,
          nav.httpStatus ?? 200,
        );

        if (wafCheck) {
          const nextStep = ESCALATION_CHAIN[i + 1];
          if (nextStep) {
            console.log(
              `[BQL] WAF detected (${wafCheck.type}) — escalating to ${nextStep.label}`,
            );
            await new Promise((r) => setTimeout(r, 500));
            continue;
          }
          throw new ScanBlockedError(
            "This site's firewall blocked our scanner even with bypass enabled.",
            nav.pageTitle,
            nav.httpStatus ?? 403,
          );
        }

        return {
          content: nav.html,
          pageTitle: nav.pageTitle,
          screenshotBase64: nav.screenshotBase64,
          mobileScreenshotBase64: nav.mobileScreenshotBase64,
        };
      } catch (err) {
        if (err instanceof ScanBlockedError) throw err;

        const nextStep = ESCALATION_CHAIN[i + 1];
        if (nextStep) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(
            `[BQL] ${step.label} failed: ${msg} — escalating to ${nextStep.label}`,
          );
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        throw err;
      }
    }

    throw new Error("BQL escalation chain exhausted without result");
  }

  /**
   * Dedicated screenshot retry. Navigates to the URL again (WAF challenge
   * should be cached) and captures desktop + mobile screenshots.
   * Returns null if the retry fails — screenshots are best-effort.
   */
  private async retryScreenshots(
    url: string,
    timeoutMs: number,
  ): Promise<{ desktopBase64: string | null; mobileBase64: string | null } | null> {
    const query = `mutation Screenshots {
  desktopVp: viewport(width: ${DESKTOP_VP.width}, height: ${DESKTOP_VP.height}) { time }
  goto(url: "${url}", waitUntil: load) { status time }
  waitForNavigation(timeout: 15000, waitUntil: networkIdle) { time }
  desktopScreenshot: screenshot(fullPage: false, type: jpeg, quality: 90) { base64 }
  mobileVp: viewport(width: ${MOBILE_VP.width}, height: ${MOBILE_VP.height}) { time }
  mobileScreenshot: screenshot(fullPage: false, type: jpeg, quality: 90) { base64 }
}`;

    try {
      const data = await callBql(query, this.token, this.cloudUrl, {
        proxy: true,
        humanlike: true,
        timeoutMs,
      });

      if (data.errors?.length) {
        console.log(`[BQL] Screenshot retry returned errors: ${data.errors.map(e => e.message).join("; ")}`);
        return null;
      }

      const d = data.data as Record<string, Record<string, unknown>> | undefined;
      const desktop = d?.desktopScreenshot as { base64?: string } | undefined;
      const mobile = d?.mobileScreenshot as { base64?: string } | undefined;

      const hasScreenshots = !!desktop?.base64 || !!mobile?.base64;
      if (hasScreenshots) {
        console.log("[BQL] Screenshot retry succeeded");
      } else {
        console.log("[BQL] Screenshot retry returned no data");
      }

      return {
        desktopBase64: desktop?.base64 ?? null,
        mobileBase64: mobile?.base64 ?? null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[BQL] Screenshot retry failed: ${msg}`);
      return null;
    }
  }
}
