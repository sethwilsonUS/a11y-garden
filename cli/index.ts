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
import { scanUrl, ScanBlockedError } from "@/lib/scanner";
import { calculateGrade } from "@/lib/grading";
import {
  generateMarkdownReport,
  type ReportData,
  type AxeViolation,
} from "@/lib/report";
import { generateAISummary } from "@/lib/ai-summary";

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
  .action(
    async (
      rawUrl: string,
      options: { ai: boolean; markdown: boolean; json: boolean; screenshot?: boolean | string },
    ) => {
      // ---- Normalize URL ----------------------------------------------------
      let url = rawUrl.trim();
      if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
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

      // ---- Scan -------------------------------------------------------------
      const spinner = ora({
        text: `Scanning ${chalk.cyan(url)}...`,
        stream: process.stderr,
      }).start();

      const wantsScreenshot = options.screenshot !== undefined && options.screenshot !== false;

      let scanResult;
      try {
        scanResult = await scanUrl(url, { captureScreenshot: wantsScreenshot });
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

      spinner.succeed(
        `Page loaded: ${chalk.white.bold(`"${scanResult.pageTitle || "Untitled"}"`)}` +
          (scanResult.safeMode ? chalk.yellow(" (safe mode)") : ""),
      );

      // ---- Screenshot (optional) ---------------------------------------------
      if (wantsScreenshot && scanResult.screenshot) {
        const outPath =
          typeof options.screenshot === "string"
            ? options.screenshot
            : "screenshot.jpg";
        writeFileSync(outPath, scanResult.screenshot);
        const sizeKB = Math.round(scanResult.screenshot.length / 1024);
        if (isTTY) {
          console.error(
            chalk.green(`  ✓ Screenshot saved to ${chalk.white.bold(outPath)} (${sizeKB} KB)\n`),
          );
        }
      } else if (wantsScreenshot && !scanResult.screenshot) {
        if (isTTY) {
          console.error(chalk.yellow("  ⚠ Screenshot capture failed\n"));
        }
      }

      // ---- Grade ------------------------------------------------------------
      const { score, grade } = calculateGrade(scanResult.violations);

      // ---- AI Summary (optional) --------------------------------------------
      // Runs automatically when OPENAI_API_KEY is set.
      // --no-ai explicitly skips it; missing key silently degrades.
      let aiSummary: string | undefined;
      let topIssues: string[] | undefined;

      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
      const wantsAI = options.ai && hasOpenAIKey;

      if (options.ai && !hasOpenAIKey && isTTY) {
        console.error(
          chalk.dim("  ℹ OPENAI_API_KEY not set — skipping AI summary\n"),
        );
      }

      if (wantsAI && scanResult.violations.total > 0) {
        const aiSpinner = ora({
          text: "Generating AI summary...",
          stream: process.stderr,
        }).start();

        try {
          const aiResult = await generateAISummary(
            scanResult.rawViolations,
          );
          aiSummary = aiResult.summary;
          topIssues = aiResult.topIssues;
          aiSpinner.succeed("AI analysis complete");
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : "unknown error";
          aiSpinner.warn(`AI summary skipped: ${msg}`);
        }
      } else if (wantsAI && scanResult.violations.total === 0) {
        aiSummary =
          "Excellent! This page passed all automated accessibility checks. While automated testing can't catch every accessibility issue, this is a great foundation.";
        topIssues = [];
      }

      // ---- Build report data ------------------------------------------------
      const reportData: ReportData = {
        url,
        pageTitle: scanResult.pageTitle,
        letterGrade: grade,
        score,
        scannedAt: Date.now(),
        violations: scanResult.violations,
        scanMode: scanResult.safeMode ? "safe" : "full",
        rawViolations: scanResult.rawViolations,
        ...(aiSummary !== undefined && { aiSummary }),
        ...(topIssues !== undefined && { topIssues }),
      };

      // ---- Output -----------------------------------------------------------
      if (options.json) {
        const output = {
          url,
          pageTitle: scanResult.pageTitle,
          letterGrade: grade,
          score,
          violations: scanResult.violations,
          safeMode: scanResult.safeMode,
          truncated: scanResult.truncated,
          ...(aiSummary !== undefined && { aiSummary }),
          ...(topIssues !== undefined && { topIssues }),
          rawViolations: JSON.parse(scanResult.rawViolations),
          ...(scanResult.warning && { warning: scanResult.warning }),
        };
        console.log(JSON.stringify(output, null, 2));
      } else if (options.markdown) {
        console.log(generateMarkdownReport(reportData));
      } else {
        // Default: pretty terminal format
        console.log(formatTerminalReport(reportData));
      }
    },
  );

program.parseAsync().catch((error) => {
  console.error(
    chalk.red(error instanceof Error ? error.message : "Fatal error"),
  );
  process.exit(1);
});
