#!/usr/bin/env node

/**
 * A11y Garden CLI
 *
 * Scan websites for accessibility issues from the terminal.
 * Outputs a pretty terminal report by default (spinners go to stderr,
 * so piping to a file works out of the box).
 *
 * Usage:
 *   a11ygarden <url>                # scan and print terminal report
 *   a11ygarden <url> --markdown     # output markdown report
 *   a11ygarden <url> --json         # output raw JSON
 *   a11ygarden <url> --no-ai        # skip AI even if OPENAI_API_KEY is set
 *   a11ygarden <url> --markdown > report.md
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Load .env.local (Next.js convention) so the CLI picks up OPENAI_API_KEY
// and any other vars without requiring the user to export them manually.
// Doesn't override variables already in the environment.
// ---------------------------------------------------------------------------
try {
  const envContent = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env.local not found — that's fine, not required
}

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { scanUrl, scanUrlDual, ScanBlockedError } from "@/lib/scanner";
import { PLATFORM_LABELS } from "@/lib/platforms";
import { calculateGrade, calculateCombinedGrade } from "@/lib/grading";
import {
  generateMarkdownReport,
  type ReportData,
  type AxeViolation,
} from "@/lib/report";
import { generateAISummary, DEFAULT_AI_MODEL } from "@/lib/ai-summary";

// ---------------------------------------------------------------------------
// Terminal report formatter
// ---------------------------------------------------------------------------

/** Grade → chalk color function */
function gradeColor(grade: string): (text: string) => string {
  const map: Record<string, (text: string) => string> = {
    A: chalk.green.bold,
    B: chalk.green,
    C: chalk.yellow,
    D: chalk.red,
    F: chalk.red.bold,
  };
  return map[grade] || chalk.white;
}

/** Severity → chalk color function */
function severityColor(
  severity: string,
  count: number,
): (text: string) => string {
  if (count === 0) return chalk.dim;
  const map: Record<string, (text: string) => string> = {
    critical: chalk.red.bold,
    serious: chalk.hex("#f97316"),
    moderate: chalk.yellow,
    minor: chalk.dim,
  };
  return map[severity] || chalk.white;
}

function formatTerminalReport(data: ReportData): string {
  const lines: string[] = [];

  const divider = chalk.dim("  " + "─".repeat(52));

  // ---- Header -------------------------------------------------------------
  const title = data.pageTitle
    ? `${data.pageTitle} — Accessibility Report`
    : "Accessibility Report";

  lines.push("");
  lines.push(chalk.bold(`  ${title}`));
  lines.push("");
  lines.push(`  ${chalk.dim("URL")}      ${chalk.cyan(data.url)}`);

  const colorFn = gradeColor(data.letterGrade);
  lines.push(
    `  ${chalk.dim("Grade")}    ${colorFn(`${data.letterGrade} (${data.score}/100)`)}`,
  );

  const date = new Date(data.scannedAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  lines.push(`  ${chalk.dim("Scanned")}  ${date}`);

  if (data.platform) {
    const label = PLATFORM_LABELS[data.platform] ?? data.platform;
    lines.push(`  ${chalk.dim("Platform")} ${label}`);
  }

  if (data.scanMode === "safe") {
    lines.push("");
    lines.push(
      chalk.yellow("  ⚠ Safe Mode — not all checks were performed."),
    );
  }

  lines.push("");
  lines.push(
    chalk.dim(
      "  This report reflects automated checks only and is not a",
    ),
  );
  lines.push(chalk.dim("  substitute for a comprehensive WCAG audit."));

  // ---- Violations summary -------------------------------------------------
  lines.push("");
  lines.push(divider);
  lines.push("");
  lines.push(chalk.bold("  Violations"));
  lines.push("");

  const pad = (s: string) => s.padEnd(10);
  const severities: Array<{
    key: keyof ReportData["violations"];
    label: string;
  }> = [
    { key: "critical", label: "Critical" },
    { key: "serious", label: "Serious" },
    { key: "moderate", label: "Moderate" },
    { key: "minor", label: "Minor" },
  ];

  for (const { key, label } of severities) {
    const count = data.violations[key];
    const color = severityColor(key, count);
    lines.push(color(`    ${pad(label)} ${count}`));
  }

  lines.push(chalk.dim(`    ${"─".repeat(16)}`));
  lines.push(chalk.bold(`    ${pad("Total")} ${data.violations.total}`));

  // ---- AI Summary ---------------------------------------------------------
  if (data.aiSummary) {
    lines.push("");
    lines.push(divider);
    lines.push("");
    lines.push(chalk.bold("  AI Summary"));
    lines.push("");

    // Word-wrap the summary at ~70 chars, indented by 2 spaces
    const words = data.aiSummary.split(" ");
    let line = "  ";
    for (const word of words) {
      if (line.length + word.length + 1 > 72 && line.trim().length > 0) {
        lines.push(line);
        line = "  ";
      }
      line += (line.trim().length > 0 ? " " : "") + word;
    }
    if (line.trim().length > 0) lines.push(line);
  }

  // ---- Top issues ---------------------------------------------------------
  if (data.topIssues && data.topIssues.length > 0) {
    lines.push("");
    lines.push(divider);
    lines.push("");
    lines.push(chalk.bold("  Top Issues"));
    lines.push("");

    for (let i = 0; i < data.topIssues.length; i++) {
      lines.push(`  ${chalk.bold(`${i + 1}.`)} ${data.topIssues[i]}`);
    }
  }

  // ---- Platform Tip -------------------------------------------------------
  if (data.platformTip && data.platform) {
    const label = PLATFORM_LABELS[data.platform] ?? data.platform;
    lines.push("");
    lines.push(divider);
    lines.push("");
    lines.push(chalk.bold(`  ${label} Tip`));
    lines.push("");

    // Word-wrap the tip at ~70 chars, indented by 2 spaces
    const words = data.platformTip.split(" ");
    let line = "  ";
    for (const word of words) {
      if (line.length + word.length + 1 > 72 && line.trim().length > 0) {
        lines.push(line);
        line = "  ";
      }
      line += (line.trim().length > 0 ? " " : "") + word;
    }
    if (line.trim().length > 0) lines.push(line);
  }

  // ---- Violations by rule -------------------------------------------------
  if (data.rawViolations) {
    try {
      const violations: AxeViolation[] = JSON.parse(data.rawViolations);
      if (violations.length > 0) {
        lines.push("");
        lines.push(divider);
        lines.push("");
        lines.push(chalk.bold("  Violations by Rule"));

        const severityOrder = ["critical", "serious", "moderate", "minor"];
        const grouped = severityOrder.reduce(
          (acc, severity) => {
            acc[severity] = violations.filter((v) => v.impact === severity);
            return acc;
          },
          {} as Record<string, AxeViolation[]>,
        );

        for (const severity of severityOrder) {
          const items = grouped[severity];
          if (!items || items.length === 0) continue;

          const label =
            severity.charAt(0).toUpperCase() + severity.slice(1);
          const color = severityColor(severity, items.length);

          lines.push("");
          lines.push(color(`  ${label} (${items.length})`));
          lines.push("");

          for (const v of items) {
            const count = `${v.nodes.length} element${v.nodes.length === 1 ? "" : "s"}`;
            lines.push(`    ${chalk.dim("▸")} ${v.help} ${chalk.dim(`(${v.id})`)} — ${chalk.dim(count)}`);
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  // ---- Footer -------------------------------------------------------------
  lines.push("");
  lines.push(divider);
  lines.push("");
  lines.push(chalk.dim("  Report generated by A11y Garden"));
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("a11ygarden")
  .description("🌱 Scan websites for accessibility issues from your terminal")
  .version("0.1.0")
  .argument("<url>", "URL to scan (e.g. walmart.com)")
  .option("--no-ai", "Skip AI summary even if OPENAI_API_KEY is set")
  .option("--markdown", "Output a markdown report instead of terminal format")
  .option("--json", "Output raw JSON")
  .option("--screenshot [path]", "Save a screenshot of the scanned page (default: screenshot.jpg)")
  .option("--local", "Force local Playwright even if BROWSERLESS_URL is set")
  .option("--desktop-only", "Skip mobile viewport scan (desktop only)")
  .action(
    async (
      rawUrl: string,
      options: { ai: boolean; markdown: boolean; json: boolean; screenshot?: boolean | string; local?: boolean; desktopOnly?: boolean },
    ) => {
      // ---- Normalize URL ----------------------------------------------------
      let url = rawUrl.trim();
      if (!/^https?:\/\//i.test(url)) {
        // Use http:// for local addresses (no TLS), https:// for everything else
        const looksLocal = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?/i.test(url);
        url = `${looksLocal ? "http" : "https"}://${url}`;
      }

      try {
        new URL(url);
      } catch {
        console.error(chalk.red(`\n  Invalid URL: ${rawUrl}\n`));
        process.exit(1);
      }

      const isTTY = process.stderr.isTTY;

      if (isTTY) {
        console.error(chalk.green.bold("\n  🌱 A11y Garden CLI\n"));
      }

      // ---- Build browser WS endpoint (mirrors API route logic) ---------------
      // Uses BROWSERLESS_URL / BROWSERLESS_TOKEN from env (.env.local) when
      // available, so the CLI produces identical results to the web UI.
      // --local flag skips this and forces local Playwright.
      let browserWSEndpoint: string | undefined;
      if (!options.local) {
        const browserlessUrl = process.env.BROWSERLESS_URL;
        const browserlessToken = process.env.BROWSERLESS_TOKEN;
        if (browserlessUrl) {
          browserWSEndpoint = browserlessToken
            ? `${browserlessUrl}?token=${browserlessToken}`
            : browserlessUrl;
        }
      }

      // ---- Scan -------------------------------------------------------------
      const usingRemote = !!browserWSEndpoint;
      const spinner = ora({
        text: `Scanning ${chalk.cyan(url)}${usingRemote ? chalk.dim(" (via Browserless)") : ""}...`,
        stream: process.stderr,
      }).start();

      const wantsScreenshot = options.screenshot !== undefined && options.screenshot !== false;

      let scanResult;
      let dualResult;
      const desktopOnly = !!options.desktopOnly;

      try {
        if (desktopOnly) {
          scanResult = await scanUrl(url, {
            captureScreenshot: wantsScreenshot,
            browserWSEndpoint,
          });
        } else {
          dualResult = await scanUrlDual(url, {
            captureScreenshot: wantsScreenshot,
            browserWSEndpoint,
          });
        }
      } catch (error) {
        if (error instanceof ScanBlockedError) {
          spinner.fail(
            `Site's firewall blocked the scan (HTTP ${error.httpStatus})`,
          );
          console.error(
            chalk.yellow(
              "  This site's WAF prevented automated scanning. Try a different URL.\n",
            ),
          );
          process.exit(1);
        }
        spinner.fail("Scan failed");
        console.error(
          chalk.red(
            `  ${error instanceof Error ? error.message : "Unknown error"}\n`,
          ),
        );
        process.exit(1);
      }

      // Normalize to a single-viewport result for desktop-only mode
      if (desktopOnly && scanResult) {
        spinner.succeed(
          `Page loaded: ${chalk.white.bold(`"${scanResult.pageTitle || "Untitled"}"`)}` +
            (scanResult.safeMode ? chalk.yellow(" (safe mode)") : ""),
        );
      } else if (dualResult) {
        spinner.succeed(
          `Page loaded: ${chalk.white.bold(`"${dualResult.pageTitle || "Untitled"}"`)}` +
            (dualResult.desktop.safeMode ? chalk.yellow(" (desktop: safe mode)") : "") +
            (dualResult.mobile.safeMode ? chalk.yellow(" (mobile: safe mode)") : ""),
        );
      }

      // ---- Screenshot (optional) ---------------------------------------------
      const desktopScreenshot = desktopOnly ? scanResult?.screenshot : dualResult?.desktop.screenshot;
      if (wantsScreenshot && desktopScreenshot) {
        const outPath =
          typeof options.screenshot === "string"
            ? options.screenshot
            : "screenshot.jpg";
        writeFileSync(outPath, desktopScreenshot);
        const sizeKB = Math.round(desktopScreenshot.length / 1024);
        if (isTTY) {
          console.error(
            chalk.green(`  ✓ Desktop screenshot saved to ${chalk.white.bold(outPath)} (${sizeKB} KB)\n`),
          );
        }
      }
      if (wantsScreenshot && !desktopOnly && dualResult?.mobile.screenshot) {
        const mobilePath = "screenshot-mobile.jpg";
        writeFileSync(mobilePath, dualResult.mobile.screenshot);
        const sizeKB = Math.round(dualResult.mobile.screenshot.length / 1024);
        if (isTTY) {
          console.error(
            chalk.green(`  ✓ Mobile screenshot saved to ${chalk.white.bold(mobilePath)} (${sizeKB} KB)\n`),
          );
        }
      }

      // ---- Grade ------------------------------------------------------------
      const desktopViolations = desktopOnly ? scanResult!.violations : dualResult!.desktop.violations;
      const desktopGradeResult = calculateGrade(desktopViolations);
      
      let mobileGradeResult;
      let combinedGradeResult;
      if (!desktopOnly && dualResult) {
        mobileGradeResult = calculateGrade(dualResult.mobile.violations);
        combinedGradeResult = calculateCombinedGrade(desktopGradeResult.score, mobileGradeResult.score);
      }
      
      const primaryScore = combinedGradeResult?.score ?? desktopGradeResult.score;
      const primaryGrade = combinedGradeResult?.grade ?? desktopGradeResult.grade;

      // ---- AI Summary (optional) --------------------------------------------
      let aiSummary: string | undefined;
      let topIssues: string[] | undefined;
      let platformTip: string | undefined;

      const detectedPlatform = desktopOnly ? scanResult?.platform : dualResult?.platform;
      const desktopRawViolations = desktopOnly ? scanResult!.rawViolations : dualResult!.desktop.rawViolations;

      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
      const wantsAI = options.ai && hasOpenAIKey;

      if (options.ai && !hasOpenAIKey && isTTY) {
        console.error(
          chalk.dim("  ℹ OPENAI_API_KEY not set — skipping AI summary\n"),
        );
      }

      if (wantsAI && desktopViolations.total > 0) {
        const aiSpinner = ora({
          text: "Generating AI summary...",
          stream: process.stderr,
        }).start();

        try {
          const aiResult = await generateAISummary(
            desktopRawViolations,
            DEFAULT_AI_MODEL,
            detectedPlatform,
          );
          aiSummary = aiResult.summary;
          topIssues = aiResult.topIssues;
          platformTip = aiResult.platformTip;
          aiSpinner.succeed("AI analysis complete");
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : "unknown error";
          aiSpinner.warn(`AI summary skipped: ${msg}`);
        }
      } else if (wantsAI && desktopViolations.total === 0) {
        aiSummary =
          "Excellent! This page passed all automated accessibility checks. While automated testing can't catch every accessibility issue, this is a great foundation.";
        topIssues = [];
      }

      // ---- Build report data ------------------------------------------------
      const desktopSafeMode = desktopOnly ? scanResult!.safeMode : dualResult!.desktop.safeMode;
      
      const reportData: ReportData = {
        url,
        pageTitle: desktopOnly ? scanResult!.pageTitle : dualResult!.pageTitle,
        letterGrade: primaryGrade,
        score: primaryScore,
        scannedAt: Date.now(),
        violations: desktopViolations,
        scanMode: desktopSafeMode ? "safe" : "full",
        rawViolations: desktopRawViolations,
        ...(aiSummary !== undefined && { aiSummary }),
        ...(topIssues !== undefined && { topIssues }),
        ...(detectedPlatform && { platform: detectedPlatform }),
        ...(platformTip && { platformTip }),
        // Mobile fields for report generator
        ...(!desktopOnly && dualResult ? {
          mobileViolations: dualResult.mobile.violations,
          mobileLetterGrade: mobileGradeResult!.grade,
          mobileScore: mobileGradeResult!.score,
          mobileScanMode: (dualResult.mobile.safeMode ? "safe" : "full") as "full" | "safe",
          mobileRawViolations: dualResult.mobile.rawViolations,
          ...(dualResult.mobile.truncated && { mobileTruncated: true }),
        } : {}),
      };

      // ---- Output -----------------------------------------------------------
      if (options.json) {
        const output: Record<string, unknown> = {
          url,
          pageTitle: desktopOnly ? scanResult!.pageTitle : dualResult!.pageTitle,
          letterGrade: primaryGrade,
          score: primaryScore,
          ...(detectedPlatform && { platform: detectedPlatform }),
          ...(aiSummary !== undefined && { aiSummary }),
          ...(topIssues !== undefined && { topIssues }),
          desktop: {
            letterGrade: desktopGradeResult.grade,
            score: desktopGradeResult.score,
            violations: desktopViolations,
            safeMode: desktopSafeMode,
            truncated: desktopOnly ? scanResult!.truncated : dualResult!.desktop.truncated,
            rawViolations: JSON.parse(desktopRawViolations),
          },
        };
        if (!desktopOnly && dualResult && mobileGradeResult) {
          output.mobile = {
            letterGrade: mobileGradeResult.grade,
            score: mobileGradeResult.score,
            violations: dualResult.mobile.violations,
            safeMode: dualResult.mobile.safeMode,
            truncated: dualResult.mobile.truncated,
            rawViolations: JSON.parse(dualResult.mobile.rawViolations),
          };
        }
        console.log(JSON.stringify(output, null, 2));
      } else if (options.markdown) {
        console.log(generateMarkdownReport(reportData));
      } else {
        // Default: pretty terminal format (desktop section)
        console.log(formatTerminalReport(reportData));
        
        // Print mobile section if dual scan
        if (!desktopOnly && dualResult && mobileGradeResult) {
          const mobileReportData: ReportData = {
            url,
            pageTitle: dualResult.pageTitle,
            letterGrade: mobileGradeResult.grade,
            score: mobileGradeResult.score,
            scannedAt: Date.now(),
            violations: dualResult.mobile.violations,
            scanMode: dualResult.mobile.safeMode ? "safe" : "full",
            rawViolations: dualResult.mobile.rawViolations,
          };
          console.log(chalk.bold("\n  ── Mobile Viewport (390×844) ──\n"));
          console.log(formatTerminalReport(mobileReportData));
        }
        
        // Show combined grade for dual scans
        if (combinedGradeResult) {
          const colorFn = gradeColor(combinedGradeResult.grade);
          console.log(chalk.bold("  ── Combined Grade ──\n"));
          console.log(`  ${colorFn(`${combinedGradeResult.grade} (${combinedGradeResult.score}/100)`)} ${chalk.dim("(60% desktop + 40% mobile)")}\n`);
        }
      }
    },
  );

program.parseAsync().catch((error) => {
  console.error(
    chalk.red(error instanceof Error ? error.message : "Fatal error"),
  );
  process.exit(1);
});
