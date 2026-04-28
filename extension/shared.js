export const DEFAULT_APP_ORIGIN = "https://a11ygarden.org";
export const PREFS_KEY = "a11yGardenPrefs";
export const LAST_RESULT_KEY = "a11yGardenLastResult";
export const PENDING_MOBILE_SCAN_KEY = "a11yGardenPendingMobileScan";
export const ALL_URLS_PERMISSION = "<all_urls>";

export const DEFAULT_PREFS = {
  appOrigin: DEFAULT_APP_ORIGIN,
  mode: "deep",
  captureScreenshot: false,
  includeMobile: false,
  aiInsights: false,
  acceptedAiTermsAt: null,
};

export const SEVERITIES = ["critical", "serious", "moderate", "minor"];

export function normalizePrefs(value) {
  const prefs = value && typeof value === "object" ? value : {};
  const appOrigin =
    typeof prefs.appOrigin === "string" && prefs.appOrigin.trim()
      ? prefs.appOrigin.trim().replace(/\/$/, "")
      : DEFAULT_APP_ORIGIN;

  return {
    appOrigin,
    mode: "deep",
    captureScreenshot: prefs.captureScreenshot === true,
    includeMobile: prefs.includeMobile === true,
    aiInsights: prefs.aiInsights === true,
    acceptedAiTermsAt:
      typeof prefs.acceptedAiTermsAt === "number" ? prefs.acceptedAiTermsAt : null,
  };
}

export function isScannableUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

export function originPermissionPattern(url) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}/*`;
}

export function mobileScanPermissionPattern(prefs, url) {
  return prefs?.captureScreenshot ? ALL_URLS_PERMISSION : originPermissionPattern(url);
}

export function emptyCounts() {
  return { critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 };
}

export function normalizeCounts(value) {
  const counts = value && typeof value === "object" ? value : {};
  const normalized = emptyCounts();
  for (const severity of SEVERITIES) {
    normalized[severity] = safeNumber(counts[severity]);
  }
  normalized.total =
    typeof counts.total === "number"
      ? safeNumber(counts.total)
      : SEVERITIES.reduce((sum, severity) => sum + normalized[severity], 0);
  return normalized;
}

function safeNumber(value) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

export function parseFindings(rawFindings) {
  if (Array.isArray(rawFindings)) return rawFindings;
  if (typeof rawFindings !== "string" || !rawFindings.trim()) return [];
  try {
    const parsed = JSON.parse(rawFindings);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getConfirmedFindings(scan) {
  return parseFindings(scan?.rawFindings).filter(
    (finding) => finding?.disposition === "confirmed",
  );
}

export function getReviewFindings(scan) {
  return parseFindings(scan?.rawFindings).filter(
    (finding) => finding?.disposition === "needs-review",
  );
}

export function getFindingNodeCount(finding) {
  return Math.max(
    Number.isFinite(finding?.totalNodes) ? finding.totalNodes : 0,
    Array.isArray(finding?.nodes) ? finding.nodes.length : 0,
  );
}

export function getPrimarySelector(finding) {
  const nodes = Array.isArray(finding?.nodes) ? finding.nodes : [];
  const selectorNode = nodes.find((node) => typeof node?.selector === "string" && node.selector);
  if (selectorNode) return selectorNode.selector;
  const targetNode = nodes.find((node) => Array.isArray(node?.target) && node.target.length > 0);
  return targetNode ? targetNode.target.join(" ") : "document";
}

export function formatEngineName(engine) {
  if (engine === "axe") return "axe-core";
  if (engine === "htmlcs") return "HTML_CodeSniffer";
  if (engine === "ace") return "IBM ACE";
  return String(engine || "unknown");
}

export function parseEngineSummary(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export function safeFilename(value, fallback = "a11y-garden") {
  const base = String(value || fallback)
    .replace(/^https?:\/\//i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return base || fallback;
}

export function getAuditTitle(audit) {
  return audit?.pageTitle || audit?.desktop?.pageTitle || audit?.url || "A11y Garden scan";
}

export function getAuditUrl(audit) {
  return audit?.url || audit?.desktop?.url || "";
}

export function getHostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url || "unknown-site";
  }
}

export function severityLabel(severity) {
  return String(severity || "minor").charAt(0).toUpperCase() + String(severity || "minor").slice(1);
}

export function buildRedactedFindings(scan) {
  return parseFindings(scan?.rawFindings).map((finding) => ({
    id: String(finding?.id || "unknown-rule"),
    dedupKey: typeof finding?.dedupKey === "string" ? finding.dedupKey : undefined,
    disposition:
      finding?.disposition === "needs-review" ? "needs-review" : "confirmed",
    impact: SEVERITIES.includes(finding?.impact) ? finding.impact : "minor",
    help: String(finding?.help || finding?.description || finding?.id || "Accessibility finding"),
    description: String(finding?.description || finding?.help || finding?.id || ""),
    helpUrl: typeof finding?.helpUrl === "string" ? finding.helpUrl : undefined,
    engines: Array.isArray(finding?.engines) ? finding.engines.map(String) : [],
    wcagCriteria: Array.isArray(finding?.wcagCriteria)
      ? finding.wcagCriteria.map(String)
      : [],
    wcagTags: Array.isArray(finding?.wcagTags) ? finding.wcagTags.map(String) : [],
    totalNodes: getFindingNodeCount(finding),
    nodes: (Array.isArray(finding?.nodes) ? finding.nodes : [])
      .slice(0, 5)
      .map((node) => ({
        selector:
          typeof node?.selector === "string" && node.selector
            ? node.selector
            : Array.isArray(node?.target)
              ? node.target.join(" ")
              : "document",
      })),
  }));
}

export function buildAiPayload(audit) {
  const desktop = audit?.desktop || null;
  const mobile = audit?.mobile || null;
  return {
    auditId: audit?.id,
    url: getAuditUrl(audit),
    pageTitle: getAuditTitle(audit),
    scannedAt: audit?.scannedAt,
    scanMode: audit?.scanMode || desktop?.scanMode,
    viewportMode: audit?.viewportMode || "live",
    engineProfile: desktop?.engineProfile || "strict",
    platform: audit?.platform || desktop?.platform,
    acceptedTerms: true,
    desktop: desktop
      ? {
          viewport: "desktop",
          viewportWidth: desktop.viewportWidth,
          viewportHeight: desktop.viewportHeight,
          violations: normalizeCounts(desktop.violations),
          reviewViolations: normalizeCounts(desktop.reviewViolations),
          findings: buildRedactedFindings(desktop),
        }
      : null,
    mobile: mobile
      ? {
          viewport: "mobile",
          viewportWidth: mobile.viewportWidth,
          viewportHeight: mobile.viewportHeight,
          violations: normalizeCounts(mobile.violations),
          reviewViolations: normalizeCounts(mobile.reviewViolations),
          findings: buildRedactedFindings(mobile),
        }
      : null,
  };
}

export function buildMarkdownReport(audit) {
  const title = getAuditTitle(audit);
  const url = getAuditUrl(audit);
  const lines = [
    `# ${title} - Accessibility Report`,
    "",
    `**URL:** ${url}`,
    `**Scanned:** ${formatDateTime(audit.scannedAt)}`,
    `**Source:** A11y Garden Chrome extension`,
    "",
    "> This report reflects automated checks only and is not a substitute for a comprehensive WCAG audit.",
    "",
  ];

  lines.push(...renderScanSection("Desktop / current tab", audit.desktop));
  if (audit.mobile) {
    lines.push("", "---", "");
    lines.push(...renderScanSection("Mobile clone (390x844)", audit.mobile));
  }

  if (audit.aiSummary) {
    lines.push("", "---", "", "## AI Summary", "", audit.aiSummary, "");
    if (Array.isArray(audit.topIssues) && audit.topIssues.length > 0) {
      lines.push("## Top Issues", "");
      audit.topIssues.forEach((issue, index) => {
        lines.push(`${index + 1}. ${issue}`);
      });
      lines.push("");
    }
    if (audit.platformTip) {
      lines.push("## Platform Tip", "", audit.platformTip, "");
    }
  }

  lines.push("", "---", "", "Report generated by A11y Garden.");
  return `${lines.join("\n").trim()}\n`;
}

function renderScanSection(label, scan) {
  if (!scan) return [];
  const confirmed = normalizeCounts(scan.violations);
  const review = normalizeCounts(scan.reviewViolations);
  const lines = [
    `## ${label}`,
    "",
    `**Viewport:** ${scan.viewportWidth || "?"}x${scan.viewportHeight || "?"}`,
    "",
    "| Severity | Confirmed | Needs review |",
    "| --- | ---: | ---: |",
  ];

  for (const severity of SEVERITIES) {
    lines.push(`| ${severityLabel(severity)} | ${confirmed[severity]} | ${review[severity]} |`);
  }
  lines.push(`| **Total** | **${confirmed.total}** | **${review.total}** |`, "");

  const summary = parseEngineSummary(scan.engineSummary);
  if (summary?.engines?.length) {
    lines.push("### Engines", "");
    for (const engine of summary.engines) {
      const note = engine.note ? ` - ${engine.note}` : "";
      lines.push(
        `- **${formatEngineName(engine.engine)}:** ${engine.status} (${engine.confirmedCount} confirmed / ${engine.reviewCount} review, ${engine.durationMs} ms)${note}`,
      );
    }
    lines.push("");
  }

  lines.push(...renderFindingsList("Confirmed Findings", getConfirmedFindings(scan)));
  lines.push(...renderFindingsList("Needs Review", getReviewFindings(scan)));
  return lines;
}

function renderFindingsList(heading, findings) {
  if (!findings.length) return [];
  const lines = [`### ${heading}`, ""];
  for (const severity of SEVERITIES) {
    const items = findings.filter((finding) => finding.impact === severity);
    if (!items.length) continue;
    lines.push(`#### ${severityLabel(severity)}`, "");
    for (const finding of items) {
      const count = getFindingNodeCount(finding);
      lines.push(
        `- **${finding.help || finding.id}** (\`${finding.id}\`) - ${count} affected node${count === 1 ? "" : "s"}; selector: \`${getPrimarySelector(finding)}\``,
      );
    }
    lines.push("");
  }
  return lines;
}

export function buildAgentPlanMarkdown(audit) {
  const confirmed = [
    ...getConfirmedFindings(audit.desktop).map((finding) => ({
      ...finding,
      viewport: "desktop/current tab",
    })),
    ...getConfirmedFindings(audit.mobile).map((finding) => ({
      ...finding,
      viewport: "mobile clone",
    })),
  ].sort((left, right) => SEVERITIES.indexOf(left.impact) - SEVERITIES.indexOf(right.impact));

  const title = getAuditTitle(audit);
  const url = getAuditUrl(audit);
  const platform = audit.platform || audit.desktop?.platform || "unknown";
  const lines = [
    "# AGENTS.md",
    "",
    "## Overview",
    "",
    `This file was generated by A11y Garden from a local Chrome extension scan.`,
    "",
    `- Site: ${title}`,
    `- URL: ${url}`,
    `- Audit date: ${new Date(audit.scannedAt).toISOString().split("T")[0]}`,
    `- Detected platform: ${platform}`,
    `- Confirmed findings: ${confirmed.length}`,
    "",
    "Use the rendered selectors as evidence. Find the source components that produce the markup, make the smallest durable fix, then re-run the extension scan.",
    "",
  ];

  for (const severity of SEVERITIES) {
    const items = confirmed.filter((finding) => finding.impact === severity);
    if (!items.length) continue;
    lines.push(`## ${severityLabel(severity)} Fixes`, "");
    for (const finding of items) {
      const selectors = (finding.nodes || [])
        .map((node) => node.selector || (Array.isArray(node.target) ? node.target.join(" ") : "document"))
        .filter(Boolean)
        .slice(0, 3);
      const engines = Array.isArray(finding.engines)
        ? finding.engines.map(formatEngineName).join(", ")
        : "unknown";
      lines.push(`- Find the source that renders \`${selectors[0] || "document"}\` and fix **${finding.help || finding.id}**.`);
      lines.push(`  Rule: \`${finding.id}\`; viewport: ${finding.viewport}; engines: ${engines}.`);
      if (finding.description) lines.push(`  Context: ${finding.description}`);
      if (selectors.length > 1) {
        lines.push(`  Also verify selectors: ${selectors.slice(1).map((selector) => `\`${selector}\``).join(", ")}.`);
      }
      if (finding.helpUrl) lines.push(`  Reference: ${finding.helpUrl}`);
    }
    lines.push("");
  }

  if (!confirmed.length) {
    lines.push("## Fixes", "", "No confirmed automated violations were found. Review any manual-review findings in the report before changing code.", "");
  }

  lines.push(
    "## Verification Steps",
    "",
    "- Re-run the A11y Garden extension scan on the same page.",
    "- Verify every fixed component with keyboard navigation.",
    "- Check accessible names and roles with browser accessibility tooling.",
    "- Manually test critical user paths with a screen reader when possible.",
    "",
    "## Don'ts",
    "",
    "- Do not remove visible focus indicators.",
    "- Do not add ARIA where native HTML would solve the issue.",
    "- Do not hide real content from assistive technology to silence a scanner.",
    "- Do not assume rendered DOM snippets are the same as source JSX or templates.",
    "",
  );

  return `${lines.join("\n").trim()}\n`;
}
