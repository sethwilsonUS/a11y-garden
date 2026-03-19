/**
 * Phase 0 — BQL Stealth Spike (server-side axe approach)
 *
 * Architecture:
 *   1. BQL stealth navigates to the URL and bypasses the WAF
 *   2. BQL returns the fully-rendered HTML
 *   3. axe-core runs server-side against the HTML via JSDOM
 *
 * This decouples WAF bypass (BQL's job) from accessibility scanning
 * (axe-core's job). No Playwright reconnect or in-page injection needed.
 *
 * Trade-off: JSDOM doesn't compute CSS, so rules like color-contrast won't
 * fire. For WAF-blocked sites, partial results > zero results.
 *
 * Usage:
 *   npx tsx scripts/test-bql-bypass.ts <URL>
 *   npx tsx scripts/test-bql-bypass.ts --batch
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import axe from "axe-core";

// Load .env.local
try {
  const envContent = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env.local not found
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TOKEN = process.env.BROWSERLESS_TOKEN;
const CLOUD_URL =
  process.env.BROWSERLESS_CLOUD_URL || "https://production-sfo.browserless.io";
const USE_PROXY = process.env.BROWSERLESS_PROXY === "residential";
const HUMANLIKE = process.env.BROWSERLESS_HUMANLIKE === "true";

const BATCH_URLS = [
  "https://www.cloudflare.com",
  "https://www.nike.com",
  "https://www.indeed.com",
  "https://www.zillow.com",
  "https://www.nordstrom.com",
  "https://www.target.com",
  "https://www.walmart.com",
  "https://www.bestbuy.com",
  "https://www.homedepot.com",
  "https://www.linkedin.com",
  "https://www.chase.com",
  "https://www.airbnb.com",
];

// ---------------------------------------------------------------------------
// BQL API
// ---------------------------------------------------------------------------

interface BqlResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

interface BqlCallOptions {
  proxy?: boolean;
  humanlike?: boolean;
}

async function callBql(
  query: string,
  operationName?: string,
  opts?: BqlCallOptions,
): Promise<BqlResponse> {
  const useProxy = opts?.proxy ?? USE_PROXY;
  const useHumanlike = opts?.humanlike ?? HUMANLIKE;

  const params = new URLSearchParams({ token: TOKEN! });
  if (useProxy) {
    params.set("proxy", "residential");
    params.set("proxyCountry", "us");
  }
  if (useHumanlike) {
    params.set("humanlike", "true");
  }

  const endpoint = `${CLOUD_URL}/stealth/bql?${params}`;
  const body: Record<string, unknown> = { query, variables: {} };
  if (operationName) body.operationName = operationName;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`BQL HTTP ${res.status}: ${text.substring(0, 300)}`);
  }

  return (await res.json()) as BqlResponse;
}

// ---------------------------------------------------------------------------
// Step 1: BQL stealth → get HTML
// ---------------------------------------------------------------------------

interface BqlNavigateResult {
  html: string;
  pageTitle: string;
  httpStatus: number | null;
  cfFound: boolean;
  cfSolved: boolean;
  gotoTimeMs: number | null;
  verifyTimeMs: number | null;
}

type PostGotoStrategy = "immediate" | "wait-nav" | "wait-selector";

async function bqlGetHtml(
  targetUrl: string,
  withVerify: boolean,
  opts?: BqlCallOptions,
  postGoto: PostGotoStrategy = "immediate",
): Promise<BqlNavigateResult> {
  let query: string;

  if (postGoto === "wait-nav") {
    query = `mutation GetHtml {
  goto(url: "${targetUrl}", waitUntil: load) { status time }
  waitForNavigation(timeout: 20000, waitUntil: networkIdle) { time }
  html { html }
}`;
  } else if (postGoto === "wait-selector") {
    query = `mutation GetHtml {
  goto(url: "${targetUrl}", waitUntil: load) { status time }
  waitForSelector(selector: "main, #root, [data-testid], article, [role=main]", timeout: 15000, visible: true) { time }
  html { html }
}`;
  } else if (withVerify) {
    query = `mutation GetHtml {
  goto(url: "${targetUrl}", waitUntil: networkIdle) { status time }
  verify(type: cloudflare) { found solved time }
  html { html }
}`;
  } else {
    query = `mutation GetHtml {
  goto(url: "${targetUrl}", waitUntil: networkIdle) { status time }
  html { html }
}`;
  }

  const data = await callBql(query, "GetHtml", opts);

  if (data.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join("; "));
  }

  const d = data.data as Record<string, Record<string, unknown>> | undefined;
  const goto = d?.goto as { status?: number; time?: number } | undefined;
  const verify = d?.verify as { found?: boolean; solved?: boolean; time?: number } | undefined;
  const htmlResult = d?.html as { html?: string } | undefined;
  const html = htmlResult?.html ?? "";

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch?.[1]?.trim() ?? "";

  return {
    html,
    pageTitle,
    httpStatus: (goto?.status as number) ?? null,
    cfFound: verify?.found ?? false,
    cfSolved: verify?.solved ?? false,
    gotoTimeMs: (goto?.time as number) ?? null,
    verifyTimeMs: (verify?.time as number) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Step 2: Server-side axe-core via JSDOM
// ---------------------------------------------------------------------------

interface AxeViolationBrief {
  id: string;
  impact: string;
  description: string;
  helpUrl: string;
  nodeCount: number;
}

interface AxeResult {
  violations: number;
  counts: Record<string, number>;
  topViolations: AxeViolationBrief[];
  axeTimeMs: number;
  rulesRun: number;
}

async function runAxeOnHtml(html: string, url: string): Promise<AxeResult> {
  const start = Date.now();

  const dom = new JSDOM(html, {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });

  const window = dom.window;
  const document = window.document;

  // Inject axe-core via eval (outside-only allows this but
  // doesn't auto-execute <script> tags from the page HTML)
  window.eval(axe.source);

  // Run axe-core
  const axeInstance = (window as unknown as Record<string, unknown>).axe as typeof axe | undefined;
  if (!axeInstance) {
    throw new Error("axe-core failed to initialize in JSDOM");
  }

  axeInstance.reset();
  const results = await axeInstance.run(document.body, {
    resultTypes: ["violations"],
  });

  const violations: AxeViolationBrief[] = results.violations.map(
    (v) => ({
      id: v.id,
      impact: v.impact ?? "minor",
      description: v.description ?? "",
      helpUrl: v.helpUrl ?? "",
      nodeCount: v.nodes?.length ?? 0,
    }),
  );

  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of violations) {
    if (v.impact in counts) counts[v.impact as keyof typeof counts]++;
  }

  dom.window.close();

  return {
    violations: violations.length,
    counts,
    topViolations: violations,
    axeTimeMs: Date.now() - start,
    rulesRun: results.violations.length + (results.passes?.length ?? 0),
  };
}

// ---------------------------------------------------------------------------
// WAF detection on returned HTML
// ---------------------------------------------------------------------------

function detectWaf(
  html: string,
  title: string,
  httpStatus: number,
): { detected: boolean; type: string | null } {
  const lower = html.toLowerCase();
  const titleLower = title.toLowerCase();

  const blockedTitle =
    /access denied|attention required|just a moment|checking your browser|robot check|blocked|pardon our interruption|security check/;
  const cfPatterns = /cf-browser-verification|challenge-platform|cf-ray/;
  const akamaiPatterns = /akamai|access denied.*akamai/;
  const datadomePatterns = /captcha-delivery\.com|datadome.*device check/;

  // DataDome keeps monitoring scripts on real pages — only flag as WAF
  // if the HTML is small (challenge page is ~1-2 KB, real pages are >> 10 KB)
  if (html.length < 10_000 && datadomePatterns.test(lower)) {
    return { detected: true, type: "datadome" };
  }

  if (httpStatus === 403 || httpStatus === 503) {
    // Large pages with real titles are likely post-challenge redirects where
    // the initial goto status was 403 but the final page loaded successfully
    if (html.length > 10_000 && !blockedTitle.test(titleLower)) {
      return { detected: false, type: null };
    }
    if (cfPatterns.test(lower)) return { detected: true, type: "cloudflare" };
    if (akamaiPatterns.test(lower)) return { detected: true, type: "akamai" };
    return { detected: true, type: "generic" };
  }

  if (blockedTitle.test(titleLower)) {
    if (cfPatterns.test(lower)) return { detected: true, type: "cloudflare" };
    return { detected: true, type: "generic" };
  }

  if (lower.length < 5000 && cfPatterns.test(lower)) {
    return { detected: true, type: "cloudflare" };
  }

  return { detected: false, type: null };
}

// ---------------------------------------------------------------------------
// Single URL test
// ---------------------------------------------------------------------------

interface SpikeResult {
  url: string;
  httpStatus: number | null;
  cfFound: boolean;
  cfSolved: boolean;
  wafDetected: boolean;
  wafType: string | null;
  pageTitle: string;
  htmlSizeKb: number;
  axeViolations: number | null;
  axeCounts: Record<string, number> | null;
  topViolations: AxeViolationBrief[];
  method: "bql-jsdom" | "bql-jsdom-no-verify" | "bql-proxy" | "bql-proxy-humanlike" | "failed";
  gotoTimeMs: number | null;
  verifyTimeMs: number | null;
  axeTimeMs: number | null;
  totalTimeSeconds: number;
  attempts: number;
  error?: string;
}

interface AttemptConfig {
  label: string;
  method: SpikeResult["method"];
  verify: boolean;
  opts: BqlCallOptions;
  postGoto: PostGotoStrategy;
}

const ESCALATION_CHAIN: AttemptConfig[] = [
  { label: "stealth", method: "bql-jsdom", verify: true, opts: {}, postGoto: "immediate" },
  { label: "stealth + proxy + waitForNav", method: "bql-proxy", verify: false, opts: { proxy: true, humanlike: true }, postGoto: "wait-nav" },
  { label: "stealth + proxy + waitForSelector", method: "bql-proxy-humanlike", verify: false, opts: { proxy: true, humanlike: true }, postGoto: "wait-selector" },
];

function attemptNav(
  nav: BqlNavigateResult,
): { ok: true; waf: null } | { ok: false; waf: { detected: boolean; type: string | null } } {
  const waf = detectWaf(nav.html, nav.pageTitle, nav.httpStatus ?? 200);
  if (waf.detected) return { ok: false, waf };
  if (nav.html.length < 1500 && !nav.pageTitle) return { ok: false, waf: { detected: true, type: "empty-shell" } };
  return { ok: true, waf: null };
}

async function testUrl(targetUrl: string): Promise<SpikeResult> {
  const start = Date.now();
  const result: SpikeResult = {
    url: targetUrl,
    httpStatus: null,
    cfFound: false,
    cfSolved: false,
    wafDetected: false,
    wafType: null,
    pageTitle: "",
    htmlSizeKb: 0,
    axeViolations: null,
    axeCounts: null,
    topViolations: [],
    method: "failed",
    gotoTimeMs: null,
    verifyTimeMs: null,
    axeTimeMs: null,
    totalTimeSeconds: 0,
    attempts: 0,
  };

  console.log(`\n--- Testing: ${targetUrl} ---`);

  for (const attempt of ESCALATION_CHAIN) {
    result.attempts++;
    const stepLabel = `[${result.attempts}/${ESCALATION_CHAIN.length}]`;

    try {
      console.log(`  ${stepLabel} BQL ${attempt.label} → get HTML...`);
      let nav: BqlNavigateResult;

      try {
        nav = await bqlGetHtml(targetUrl, attempt.verify, attempt.opts, attempt.postGoto);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt.verify) {
          console.log(`  ${stepLabel} verify failed: ${msg}, retrying without...`);
          nav = await bqlGetHtml(targetUrl, false, attempt.opts, attempt.postGoto);
        } else {
          throw err;
        }
      }

      result.httpStatus = nav.httpStatus;
      result.cfFound = nav.cfFound;
      result.cfSolved = nav.cfSolved;
      result.pageTitle = nav.pageTitle;
      result.gotoTimeMs = nav.gotoTimeMs;
      result.verifyTimeMs = nav.verifyTimeMs;
      result.htmlSizeKb = Math.round(nav.html.length / 1024);

      console.log(`  ${stepLabel} HTTP ${result.httpStatus} — "${result.pageTitle}" (${result.htmlSizeKb} KB, ${result.gotoTimeMs}ms)`);
      if (attempt.verify && nav.cfFound !== undefined) {
        console.log(`  ${stepLabel} CF found=${result.cfFound}, solved=${result.cfSolved} (${result.verifyTimeMs}ms)`);
      }

      const check = attemptNav(nav);
      if (!check.ok) {
        result.wafDetected = check.waf.detected;
        result.wafType = check.waf.type;
        const nextAttempt = ESCALATION_CHAIN[result.attempts];
        if (nextAttempt) {
          console.log(`  ${stepLabel} WAF detected (${check.waf.type}) — escalating to ${nextAttempt.label}...`);
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        console.log(`  ${stepLabel} WAF still detected (${check.waf.type}) — all strategies exhausted`);
        result.error = `WAF not bypassed (${check.waf.type})`;
        result.totalTimeSeconds = parseFloat(((Date.now() - start) / 1000).toFixed(1));
        return result;
      }

      // WAF cleared — run axe
      result.wafDetected = false;
      result.wafType = null;
      console.log("  [axe] Running axe-core via JSDOM...");
      const axeResult = await runAxeOnHtml(nav.html, targetUrl);

      result.axeViolations = axeResult.violations;
      result.axeCounts = axeResult.counts;
      result.topViolations = axeResult.topViolations;
      result.axeTimeMs = axeResult.axeTimeMs;
      result.method = attempt.method;

      console.log(`  [OK] ${result.axeViolations} violations (${result.axeTimeMs}ms)`);
      console.log(
        `       Critical: ${axeResult.counts.critical}  Serious: ${axeResult.counts.serious}  Moderate: ${axeResult.counts.moderate}  Minor: ${axeResult.counts.minor}`,
      );
      if (axeResult.topViolations.length > 0) {
        console.log("       Top issues:");
        for (const v of axeResult.topViolations.slice(0, 5)) {
          console.log(`         [${v.impact.toUpperCase().padEnd(8)}] ${v.id} (${v.nodeCount} nodes) — ${v.description}`);
        }
      }

      result.totalTimeSeconds = parseFloat(((Date.now() - start) / 1000).toFixed(1));
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const nextAttempt = ESCALATION_CHAIN[result.attempts];
      if (nextAttempt) {
        console.log(`  ${stepLabel} Failed: ${msg} — escalating to ${nextAttempt.label}...`);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      result.error = msg;
      console.log(`  [FAIL] ${result.error}`);
    }
  }

  result.totalTimeSeconds = parseFloat(((Date.now() - start) / 1000).toFixed(1));
  return result;
}

// ---------------------------------------------------------------------------
// Batch test
// ---------------------------------------------------------------------------

async function runBatch() {
  console.log("\n=== A11y Garden — BQL Stealth + JSDOM Batch Test ===\n");
  console.log(`Cloud URL:    ${CLOUD_URL}`);
  console.log(`Proxy:        ${USE_PROXY ? "residential" : "none"}`);
  console.log(`Human-like:   ${HUMANLIKE}`);
  console.log(`URLs to test: ${BATCH_URLS.length}`);

  const results: SpikeResult[] = [];

  for (const url of BATCH_URLS) {
    const result = await testUrl(url);
    results.push(result);
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\n\n=== SUMMARY ===\n");
  console.log("| URL | HTTP | CF | WAF | HTML | Violations | Method | Tries | Time |");
  console.log("|-----|------|----|-----|------|------------|--------|-------|------|");
  for (const r of results) {
    const domain = new URL(r.url).hostname.replace("www.", "");
    const viols =
      r.axeViolations !== null
        ? `${r.axeViolations} (C:${r.axeCounts?.critical} S:${r.axeCounts?.serious} M:${r.axeCounts?.moderate})`
        : r.error?.substring(0, 30) ?? "n/a";
    const cf = r.cfFound ? (r.cfSolved ? "solved" : "found") : "no";
    console.log(
      `| ${domain} | ${r.httpStatus ?? "?"} | ${cf} | ${r.wafDetected ? r.wafType : "no"} | ${r.htmlSizeKb}KB | ${viols} | ${r.method} | ${r.attempts} | ${r.totalTimeSeconds}s |`,
    );
  }

  const succeeded = results.filter((r) => r.method !== "failed").length;
  const total = results.length;
  const avgTime = results.reduce((s, r) => s + r.totalTimeSeconds, 0) / total;

  console.log(`\nSuccess rate: ${succeeded}/${total} (${((succeeded / total) * 100).toFixed(0)}%)`);
  console.log(`Avg time: ${avgTime.toFixed(1)}s`);

  if (succeeded / total < 0.7) {
    console.log("\n[WARN] Below 70% success threshold. Consider:");
    console.log("  - Adding BROWSERLESS_PROXY=residential");
    console.log("  - Adding BROWSERLESS_HUMANLIKE=true");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (!TOKEN) {
  console.error(
    "Error: BROWSERLESS_TOKEN is required.\n" +
      "Set it in .env.local or pass inline:\n" +
      "  BROWSERLESS_TOKEN=xxx npx tsx scripts/test-bql-bypass.ts <URL>",
  );
  process.exit(1);
}

const arg = process.argv[2];
if (!arg) {
  console.error(
    "Usage:\n" +
      "  Single: npx tsx scripts/test-bql-bypass.ts https://example.com\n" +
      "  Batch:  npx tsx scripts/test-bql-bypass.ts --batch",
  );
  process.exit(1);
}

if (arg === "--batch") {
  runBatch().catch((err) => {
    console.error("\n[FATAL]", err);
    process.exit(1);
  });
} else {
  testUrl(arg)
    .then((result) => {
      console.log("\n=== Final Result ===");
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error("\n[FATAL]", err);
      process.exit(1);
    });
}
