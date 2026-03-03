/**
 * Markdown report generator
 *
 * Shared between the web app results page and the CLI.
 * Generates a formatted markdown accessibility report from scan results.
 */

import { PLATFORM_LABELS, getPlatformConfidence } from "./platforms";

// Axe-core violation structure (for report / display purposes)
export interface AxeNode {
  html: string;
  target: string[];
  failureSummary?: string;
}

export interface AxeViolation {
  id: string;
  impact?: "critical" | "serious" | "moderate" | "minor";
  description: string;
  help: string;
  helpUrl: string;
  nodes: AxeNode[];
}

/** The audit fields needed to generate a markdown report. */
export interface ReportData {
  url: string;
  pageTitle?: string;
  letterGrade: string;
  score: number;
  scannedAt: number;
  aiSummary?: string;
  topIssues?: string[];
  violations: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    total: number;
  };
  scanMode?: "full" | "safe";
  rawViolations?: string;
  /** Detected website platform/CMS slug (e.g. "wordpress") */
  platform?: string;
  /** Platform-specific fix advice from AI */
  platformTip?: string;
  // Mobile viewport results (optional — missing for desktop-only/legacy audits)
  mobileViolations?: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    total: number;
  };
  mobileLetterGrade?: string;
  mobileScore?: number;
  mobileScanMode?: "full" | "safe";
  mobileRawViolations?: string;
  mobileTruncated?: boolean;
  mobileAiSummary?: string;
  mobileTopIssues?: string[];
}

function renderViolationsByRule(rawViolations: string): string {
  let md = "";
  try {
    const violations: AxeViolation[] = JSON.parse(rawViolations);
    if (violations.length > 0) {
      md += `\n---\n\n## Violations by Rule\n\n`;
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
        if (items && items.length > 0) {
          md += `### ${severity.charAt(0).toUpperCase() + severity.slice(1)}\n\n`;
          for (const violation of items) {
            md += `- **${violation.help}** (\`${violation.id}\`) — ${violation.nodes.length} element${violation.nodes.length === 1 ? "" : "s"}\n`;
          }
          md += "\n";
        }
      }
    }
  } catch {
    // Ignore JSON parse errors
  }
  return md;
}

export function generateMarkdownReport(
  audit: ReportData,
  reportUrl?: string,
): string {
  const date = new Date(audit.scannedAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let markdown = `# ${audit.pageTitle ? `${audit.pageTitle} — Accessibility Report` : "Accessibility Report"}

**URL:** ${audit.url}
**Grade:** ${audit.letterGrade} (${audit.score}/100)
**Scanned:** ${date}${audit.scanMode === "safe" ? "\n**Note:** This scan ran in Safe Mode due to site complexity. Not all checks were performed." : ""}${reportUrl ? `\n**Full Report:** ${reportUrl}` : ""}

> *This report reflects automated checks only and is not a substitute for a comprehensive WCAG audit.*

---

## Violations Summary

| Severity | Count |
|----------|-------|
| Critical | ${audit.violations.critical} |
| Serious | ${audit.violations.serious} |
| Moderate | ${audit.violations.moderate} |
| Minor | ${audit.violations.minor} |
| **Total** | **${audit.violations.total}** |
`;

  if (audit.aiSummary) {
    markdown += `
---

## AI Summary

${audit.aiSummary}
`;
  }

  if (audit.topIssues && audit.topIssues.length > 0) {
    markdown += `
---

## Top Issues to Address

${audit.topIssues.map((issue, i) => `${i + 1}. ${issue}`).join("\n")}
`;
  }

  if (audit.platformTip && audit.platform) {
    const label = PLATFORM_LABELS[audit.platform] ?? audit.platform;
    const isMedium = getPlatformConfidence(audit.platform) === "medium";
    const heading = isMedium ? `${label} Tip (detected)` : `${label} Tip`;
    const qualifier = isMedium
      ? `\n> *We detected ${label} markers on this site but aren't 100% certain. The advice below may not apply if the detection was incorrect.*\n`
      : "";
    markdown += `
---

## ${heading}
${qualifier}
${audit.platformTip}
`;
  }

  if (audit.rawViolations) {
    markdown += renderViolationsByRule(audit.rawViolations);
  }

  // Mobile viewport section (only included when mobile data exists)
  if (audit.mobileViolations) {
    markdown += `\n---\n\n# Mobile Viewport (390×844)\n\n`;
    markdown += `**Grade:** ${audit.mobileLetterGrade ?? "N/A"} (${audit.mobileScore ?? "N/A"}/100)\n`;
    if (audit.mobileScanMode === "safe") {
      markdown += `**Note:** Mobile scan ran in Safe Mode due to site complexity.\n`;
    }

    markdown += `\n| Severity | Count |\n|----------|-------|\n`;
    markdown += `| Critical | ${audit.mobileViolations.critical} |\n`;
    markdown += `| Serious | ${audit.mobileViolations.serious} |\n`;
    markdown += `| Moderate | ${audit.mobileViolations.moderate} |\n`;
    markdown += `| Minor | ${audit.mobileViolations.minor} |\n`;
    markdown += `| **Total** | **${audit.mobileViolations.total}** |\n`;

    if (audit.mobileAiSummary) {
      markdown += `\n### Mobile AI Summary\n\n${audit.mobileAiSummary}\n`;
    }

    if (audit.mobileTopIssues && audit.mobileTopIssues.length > 0) {
      markdown += `\n### Mobile Top Issues\n\n`;
      markdown += audit.mobileTopIssues.map((issue, i) => `${i + 1}. ${issue}`).join("\n") + "\n";
    }

    if (audit.mobileRawViolations) {
      markdown += renderViolationsByRule(audit.mobileRawViolations).replace("## Violations by Rule", "### Mobile Violations by Rule");
    }
  }

  markdown += `
---

*Report generated by A11y Garden*
`;

  return markdown;
}
