/**
 * Phase 0 — Local sanity check
 *
 * Connects to the local Browserless Docker container and runs an axe-core
 * audit against a non-WAF URL. Validates that the Playwright + axe-core
 * pipeline works before testing the cloud BQL stealth route.
 *
 * Usage:
 *   npm run dev:browserless              # start Docker container first
 *   npx tsx scripts/test-bql-bypass-local.ts https://example.com
 *
 * The local Docker container does NOT support BQL, stealth, or proxies.
 * This script only tests the basic BaaS/Playwright connection path.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import axe from "axe-core";

// Load .env.local so the script picks up BROWSERLESS_URL automatically
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
  // .env.local not found — rely on env vars passed directly
}

const AXE_SOURCE: string = axe.source;

const BROWSERLESS_LOCAL_URL =
  process.env.BROWSERLESS_URL || "ws://localhost:3001";

interface ViolationSummary {
  id: string;
  impact: string;
  description: string;
  nodeCount: number;
}

async function runLocalAudit(targetUrl: string) {
  const startTime = Date.now();

  console.log("\n=== A11y Garden — Local BaaS Sanity Check ===\n");
  console.log(`Target URL:  ${targetUrl}`);
  console.log(`Browserless: ${BROWSERLESS_LOCAL_URL}`);
  console.log();

  let browser;
  try {
    browser = await chromium.connectOverCDP(BROWSERLESS_LOCAL_URL);
    console.log("[OK] Connected to local Browserless");
  } catch (err) {
    console.error(
      `[FAIL] Could not connect to ${BROWSERLESS_LOCAL_URL}\n` +
        "       Is the Docker container running? Try: npm run dev:browserless\n",
    );
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1920, height: 1080 },
      colorScheme: "light",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    // Stealth basics (matching scanner.ts)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
      (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
    });

    console.log("[...] Navigating...");
    const response = await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const httpStatus = response?.status() ?? 0;
    const pageTitle = await page.title().catch(() => "(unknown)");
    console.log(`[OK] Page loaded — HTTP ${httpStatus} — "${pageTitle}"`);

    // WAF check (same patterns as scanner.ts)
    const bodyText = await page
      .evaluate(() => document.body?.innerText?.substring(0, 2000) ?? "")
      .catch(() => "");
    const blockedTitle =
      /access denied|attention required|just a moment|checking your browser|robot check|blocked/i;
    const blockedBody =
      /captcha|cf-browser-verification|challenge-platform|cloudflare/i;

    if (
      httpStatus === 403 ||
      httpStatus === 503 ||
      blockedTitle.test(pageTitle) ||
      (blockedBody.test(bodyText) && bodyText.length < 5000)
    ) {
      console.log("[WARN] WAF/block page detected — this is expected for protected sites");
      console.log(`       Title: "${pageTitle}"`);
      console.log(`       HTTP:  ${httpStatus}`);
      console.log(`       Body:  ${bodyText.substring(0, 200)}...`);
    }

    // Inject axe-core and run audit
    console.log("[...] Injecting axe-core and running audit...");
    await page.evaluate(AXE_SOURCE);

    const results = await page.evaluate(async () => {
      // @ts-expect-error axe is injected globally
      const a = window.axe;
      a.reset();
      return await a.run(document.body, { resultTypes: ["violations"] });
    });

    const violations: ViolationSummary[] = results.violations.map(
      (v: { id: string; impact?: string; description?: string; nodes?: unknown[] }) => ({
        id: v.id,
        impact: v.impact ?? "unknown",
        description: v.description ?? "",
        nodeCount: v.nodes?.length ?? 0,
      }),
    );

    const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    for (const v of violations) {
      if (v.impact in counts) counts[v.impact as keyof typeof counts]++;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log();
    console.log("=== Results ===");
    console.log(`Total violations: ${violations.length}`);
    console.log(
      `  Critical: ${counts.critical}  Serious: ${counts.serious}  Moderate: ${counts.moderate}  Minor: ${counts.minor}`,
    );
    console.log(`Time: ${elapsed}s`);
    console.log();

    if (violations.length > 0) {
      console.log("Top violations:");
      for (const v of violations.slice(0, 10)) {
        console.log(
          `  [${v.impact.toUpperCase().padEnd(8)}] ${v.id} (${v.nodeCount} nodes) — ${v.description}`,
        );
      }
    }

    console.log("\n[OK] Local sanity check passed\n");
  } finally {
    await browser.close();
  }
}

// --- CLI entry ---
const url = process.argv[2];
if (!url) {
  console.error("Usage: npx tsx scripts/test-bql-bypass-local.ts <URL>");
  console.error("Example: npx tsx scripts/test-bql-bypass-local.ts https://example.com");
  process.exit(1);
}

runLocalAudit(url).catch((err) => {
  console.error("\n[FATAL]", err);
  process.exit(1);
});
