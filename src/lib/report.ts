/**
 * Markdown report generator
 *
 * Shared between the web app results page and the CLI.
 * Generates a formatted markdown accessibility report from scan results.
 */

import { PLATFORM_LABELS, getPlatformConfidence } from "./platforms";
import {
  getFindingNodeCount,
  parseSerializedFindings,
  type EngineProfile,
  type EngineSummary,
  type FindingDisposition,
  type ViolationCounts,
} from "./findings";

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
  violations: ViolationCounts;
  reviewViolations?: ViolationCounts;
  scanMode?: "full" | "safe" | "jsdom-structural";
  engineProfile?: EngineProfile;
  engineSummary?: EngineSummary | string;
  rawFindings?: string;
  findingsVersion?: number;
  rawViolations?: string;
  /** Detected website platform/CMS slug (e.g. "wordpress") */
  platform?: string;
  /** Platform-specific fix advice from AI */
  platformTip?: string;
  scanSource?: "web" | "cli" | "extension";
  viewportMode?: "paired" | "desktop-only" | "live";
  viewportWidth?: number;
  viewportHeight?: number;
  isClaimed?: boolean;
  // Mobile viewport results (optional — missing for desktop-only/legacy audits)
  mobileViolations?: ViolationCounts;
  mobileReviewViolations?: ViolationCounts;
  mobileLetterGrade?: string;
  mobileScore?: number;
  mobileScanMode?: "full" | "safe" | "jsdom-structural";
  mobileEngineSummary?: EngineSummary | string;
  mobileRawFindings?: string;
  mobileRawViolations?: string;
  mobileTruncated?: boolean;
  mobileAiSummary?: string;
  mobileTopIssues?: string[];
}

function parseEngineSummary(
  value?: EngineSummary | string,
): EngineSummary | undefined {
  if (!value) return undefined;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as EngineSummary;
  } catch {
    return undefined;
  }
}

function renderEngineSummary(
  engineProfile?: EngineProfile,
  engineSummary?: EngineSummary | string,
): string {
  const parsed = parseEngineSummary(engineSummary);
  if (!engineProfile && !parsed) return "";

  let md = "";
  md += `\n---\n\n## Scan Engines\n\n`;
  if (engineProfile) {
    md += `- **Scan profile:** ${engineProfile === "comprehensive" ? "Comprehensive" : "Strict"}\n`;
  }
  if (!parsed) {
    return md;
  }

  for (const engine of parsed.engines) {
    const counts = `${engine.confirmedCount} confirmed / ${engine.reviewCount} review`;
    const note = engine.note ? ` — ${engine.note}` : "";
    md += `- **${engine.engine}:** ${engine.status} (${counts}, ${engine.durationMs} ms)${note}\n`;
  }

  return md;
}

function renderFindingsSection(
  rawFindings: string | undefined,
  rawViolations: string | undefined,
  disposition: FindingDisposition,
  heading: string,
): string {
  const findings = parseSerializedFindings(rawFindings, rawViolations).filter(
    (finding) => finding.disposition === disposition,
  );
  if (findings.length === 0) return "";

  let md = `\n---\n\n## ${heading}\n\n`;
  if (disposition === "needs-review") {
    md +=
      "These items came from lower-confidence checks and should be manually reviewed before treating them as confirmed defects.\n\n";
  }

  const severityOrder = ["critical", "serious", "moderate", "minor"] as const;
  for (const severity of severityOrder) {
    const items = findings.filter((finding) => finding.impact === severity);
    if (items.length === 0) continue;

    md += `### ${severity.charAt(0).toUpperCase() + severity.slice(1)}\n\n`;
    for (const finding of items) {
      const totalNodeCount = getFindingNodeCount(finding);
      md += `- **${finding.help}** (\`${finding.id}\`) — ${totalNodeCount} affected element${totalNodeCount === 1 ? "" : "s"}\n`;
    }
    md += "\n";
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

  const viewportLabel = audit.viewportMode === "live"
    ? `\n**Viewport:** Live tab${audit.viewportWidth && audit.viewportHeight ? ` (${audit.viewportWidth}×${audit.viewportHeight})` : ""}`
    : "";
  const extensionPrivacyNote = audit.scanSource === "extension"
    ? "\n**Privacy:** Extension scans do not store screenshots by default."
    : "";

  let markdown = `# ${audit.pageTitle ? `${audit.pageTitle} — Accessibility Report` : "Accessibility Report"}

**URL:** ${audit.url}
**Grade:** ${audit.letterGrade} (${audit.score}/100)
**Scanned:** ${date}${viewportLabel}${extensionPrivacyNote}${audit.scanMode === "safe" ? "\n**Note:** This scan ran in Safe Mode due to site complexity. Not all checks were performed." : ""}${audit.scanMode === "jsdom-structural" ? "\n**Note:** This scan ran in structural mode because the site required a firewall bypass. Visual and interaction-dependent checks were skipped." : ""}${reportUrl ? `\n**Full Report:** ${reportUrl}` : ""}

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

  if (audit.reviewViolations && audit.reviewViolations.total > 0) {
    markdown += `\nLower-confidence findings needing manual review: **${audit.reviewViolations.total}**`;
  }

  markdown += "\n\nGrades are based on confirmed findings only.\n";

  markdown += renderEngineSummary(audit.engineProfile, audit.engineSummary);

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

  markdown += renderFindingsSection(
    audit.rawFindings,
    audit.rawViolations,
    "confirmed",
    "Violations by Rule",
  );
  markdown += renderFindingsSection(
    audit.rawFindings,
    audit.rawViolations,
    "needs-review",
    "Needs Review",
  );

  // Mobile viewport section (only included when mobile data exists)
  if (audit.mobileViolations) {
    markdown += `\n---\n\n# Mobile Viewport (390×844)\n\n`;
    markdown += `**Grade:** ${audit.mobileLetterGrade ?? "N/A"} (${audit.mobileScore ?? "N/A"}/100)\n`;
    if (audit.mobileScanMode === "safe") {
      markdown += `**Note:** Mobile scan ran in Safe Mode due to site complexity.\n`;
    } else if (audit.mobileScanMode === "jsdom-structural") {
      markdown += `**Note:** Mobile scan ran in structural mode because the site required a firewall bypass.\n`;
    }

    markdown += `\n| Severity | Count |\n|----------|-------|\n`;
    markdown += `| Critical | ${audit.mobileViolations.critical} |\n`;
    markdown += `| Serious | ${audit.mobileViolations.serious} |\n`;
    markdown += `| Moderate | ${audit.mobileViolations.moderate} |\n`;
    markdown += `| Minor | ${audit.mobileViolations.minor} |\n`;
    markdown += `| **Total** | **${audit.mobileViolations.total}** |\n`;

    if (audit.mobileReviewViolations && audit.mobileReviewViolations.total > 0) {
      markdown += `\nLower-confidence findings needing manual review: **${audit.mobileReviewViolations.total}**\n`;
    }

    markdown += renderEngineSummary(audit.engineProfile, audit.mobileEngineSummary);

    if (audit.mobileAiSummary) {
      markdown += `\n### Mobile AI Summary\n\n${audit.mobileAiSummary}\n`;
    }

    if (audit.mobileTopIssues && audit.mobileTopIssues.length > 0) {
      markdown += `\n### Mobile Top Issues\n\n`;
      markdown += audit.mobileTopIssues.map((issue, i) => `${i + 1}. ${issue}`).join("\n") + "\n";
    }

    markdown += renderFindingsSection(
      audit.mobileRawFindings,
      audit.mobileRawViolations,
      "confirmed",
      "Mobile Violations by Rule",
    ).replace("\n## ", "\n### ");
    markdown += renderFindingsSection(
      audit.mobileRawFindings,
      audit.mobileRawViolations,
      "needs-review",
      "Mobile Needs Review",
    ).replace("\n## ", "\n### ");
  }

  markdown += `
---

*Report generated by A11y Garden*
`;

  return markdown;
}
