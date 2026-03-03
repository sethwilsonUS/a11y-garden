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

type PostGotoStrategy = "immediate" | "wait-nav" | "wait-selector";

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
    label: "stealth + proxy + waitForSelector",
    verify: false,
    proxy: true,
    humanlike: true,
    postGoto: "wait-selector",
  },
];

// ---------------------------------------------------------------------------
// BQL API
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1_000;

const DEFAULT_BQL_TIMEOUT_MS = 20_000;

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
): string {
  const isMobileDevice = !!queryOpts.mobileDevice;

  const preNav = isMobileDevice
    ? `\n  emulate(device: "${queryOpts.mobileDevice}") { time }`
    : queryOpts.screenshot
      ? `\n  desktopVp: viewport(width: ${DESKTOP_VP.width}, height: ${DESKTOP_VP.height}) { time }`
      : '';

  const desktopScreenshotLine = queryOpts.screenshot && !isMobileDevice
    ? '\n  desktopScreenshot: screenshot(fullPage: false, type: jpeg, quality: 80) { base64 }'
    : '';

  const mobileScreenshotLine = queryOpts.screenshot && !isMobileDevice
    ? `\n  mobileVp: viewport(width: ${MOBILE_VP.width}, height: ${MOBILE_VP.height}) { time }` +
      '\n  mobileScreenshot: screenshot(fullPage: false, type: jpeg, quality: 80) { base64 }'
    : '';

  const singleScreenshotLine = queryOpts.screenshot && isMobileDevice
    ? '\n  screenshot(fullPage: false, type: jpeg, quality: 80) { base64 }'
    : '';

  if (step.postGoto === "wait-nav") {
    return `mutation GetHtml {${preNav}
  goto(url: "${targetUrl}", waitUntil: load) { status time }
  waitForNavigation(timeout: 8000, waitUntil: networkIdle) { time }${desktopScreenshotLine}
  html { html }${mobileScreenshotLine}${singleScreenshotLine}
}`;
  }

  if (step.postGoto === "wait-selector") {
    return `mutation GetHtml {${preNav}
  goto(url: "${targetUrl}", waitUntil: load) { status time }
  waitForSelector(selector: "main, #root, [data-testid], article, [role=main]", timeout: 8000, visible: true) { time }${desktopScreenshotLine}
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
  let query = buildBqlQuery(targetUrl, step, queryOpts);
  let data: BqlResponse;

  try {
    data = await callBql(query, token, cloudUrl, {
      proxy: step.proxy,
      humanlike: step.humanlike,
      timeoutMs: stepTimeoutMs,
    });
  } catch (err) {
    if (step.verify) {
      query = buildBqlQuery(targetUrl, { ...step, verify: false }, queryOpts);
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
    this.cloudUrl =
      process.env.BROWSERLESS_CLOUD_URL ||
      "https://production-sfo.browserless.io";
  }

  async scan(
    url: string,
    opts: ScanStrategyOptions,
  ): Promise<StrategyScanResult> {
    if (opts.viewport === "mobile" && this.desktopCache?.url === url) {
      return this.handleMobileViewport(url, opts);
    }

    const fetchResult = await this.fetchHtml(url, opts.timeBudgetMs, {
      screenshot: opts.captureScreenshot,
    });

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

    const result: StrategyScanResult = {
      violations: axeResult.violations,
      rawViolations: axeResult.rawViolations,
      truncated: axeResult.truncated,
      scanMode: buildJsdomScanMode(axeResult.rulesRun),
      pageTitle: fetchResult.pageTitle,
      screenshot,
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
   * Two-pass escalation: find the working tier WITHOUT screenshots (fast),
   * then capture screenshots on the winning tier (best-effort).
   */
  private async fetchHtml(
    url: string,
    timeBudgetMs: number,
    queryOpts: BqlQueryOptions = {},
  ): Promise<{ content: string; pageTitle: string; screenshotBase64: string | null; mobileScreenshotBase64: string | null }> {
    const deadline = Date.now() + timeBudgetMs;

    // Pass 1: escalation WITHOUT screenshots — just get HTML
    const escalationOpts: BqlQueryOptions = { ...queryOpts, screenshot: false };
    let winningStep: EscalationStep | null = null;
    let winningNav: BqlNavigateResult | null = null;

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
        console.log(`[BQL] ${step.label} → ${url} (${Math.round(stepTimeout / 1000)}s budget, no screenshots)`);
        const nav = await bqlGetHtml(
          url,
          step,
          this.token,
          this.cloudUrl,
          escalationOpts,
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

        winningStep = step;
        winningNav = nav;
        break;
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

    if (!winningStep || !winningNav) {
      throw new Error("BQL escalation chain exhausted without result");
    }

    // Pass 2: capture desktop screenshot with winning tier (best-effort)
    if (queryOpts.screenshot) {
      const remaining = deadline - Date.now();
      if (remaining > 8_000) {
        try {
          console.log(`[BQL] Capturing screenshot with ${winningStep.label} (${Math.round(remaining / 1000)}s remaining)`);
          const shotNav = await bqlGetHtml(
            url,
            winningStep,
            this.token,
            this.cloudUrl,
            { screenshot: true },
            Math.min(remaining - 3_000, DEFAULT_BQL_TIMEOUT_MS),
          );
          winningNav = {
            ...winningNav,
            screenshotBase64: shotNav.screenshotBase64,
            mobileScreenshotBase64: shotNav.mobileScreenshotBase64,
          };
        } catch (err) {
          console.log(`[BQL] Screenshot capture failed (non-fatal): ${err instanceof Error ? err.message : err}`);
        }
      } else {
        console.log(`[BQL] Skipping screenshots — only ${Math.round(remaining / 1000)}s remaining`);
      }
    }

    return {
      content: winningNav.html,
      pageTitle: winningNav.pageTitle,
      screenshotBase64: winningNav.screenshotBase64,
      mobileScreenshotBase64: winningNav.mobileScreenshotBase64,
    };
  }
}
