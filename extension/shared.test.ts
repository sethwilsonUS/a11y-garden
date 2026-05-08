import { describe, expect, it } from "vitest";

import {
  DEFAULT_PREFS,
  buildAgentPlanMarkdown,
  buildMarkdownReport,
  mobileScanPermissionPattern,
  normalizePrefs,
} from "./shared.js";

const sampleAudit = {
  id: "audit-1",
  url: "https://example.com/products",
  pageTitle: "Example Products",
  scannedAt: new Date("2026-05-01T15:30:00Z").getTime(),
  scanSource: "extension",
  desktop: {
    url: "https://example.com/products",
    pageTitle: "Example Products",
    viewportWidth: 1440,
    viewportHeight: 900,
    engineProfile: "comprehensive",
    violations: { critical: 1, serious: 0, moderate: 0, minor: 0, total: 1 },
    reviewViolations: { critical: 0, serious: 1, moderate: 0, minor: 0, total: 1 },
    engineSummary: {
      selectedEngines: ["axe", "htmlcs", "ace"],
      engines: [
        {
          engine: "axe",
          status: "completed",
          durationMs: 120,
          confirmedCount: 1,
          reviewCount: 0,
        },
        {
          engine: "htmlcs",
          status: "completed",
          durationMs: 90,
          confirmedCount: 0,
          reviewCount: 1,
          note: "WCAG2AA standard",
        },
      ],
    },
    rawFindings: JSON.stringify([
      {
        id: "image-alt",
        dedupKey: "confirmed:img.hero:1.1.1",
        engines: ["axe"],
        engineRuleIds: { axe: ["image-alt"] },
        disposition: "confirmed",
        impact: "critical",
        help: "Images must have alternate text",
        description: "Informative images must have descriptive alt text.",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.11/image-alt",
        wcagCriteria: ["1.1.1"],
        wcagTags: ["wcag111"],
        totalNodes: 3,
        nodes: [
          {
            selector: "img.hero",
            target: ["img.hero"],
            html: "<img class=\"hero\" src=\"hero.jpg\">",
          },
        ],
      },
      {
        id: "WCAG2AA.Principle1.Guideline1_4.1_4_3.G18.Fail",
        dedupKey: "review:.promo:1.4.3",
        engines: ["htmlcs"],
        engineRuleIds: { htmlcs: ["WCAG2AA.Principle1.Guideline1_4.1_4_3.G18.Fail"] },
        disposition: "needs-review",
        impact: "serious",
        help: "Contrast should be reviewed",
        description: "Text contrast may be too low.",
        helpUrl: "https://squizlabs.github.io/HTML_CodeSniffer/Standards/WCAG2AA/",
        wcagCriteria: ["1.4.3"],
        wcagTags: ["wcag143"],
        totalNodes: 1,
        nodes: [{ selector: ".promo", target: [".promo"] }],
      },
    ]),
  },
};

describe("extension shared v1 helpers", () => {
  it("drops legacy AI, server, and screenshot preference fields when normalizing prefs", () => {
    const prefs = normalizePrefs({
      appOrigin: "https://a11ygarden.org",
      aiInsights: true,
      acceptedAiTermsAt: Date.now(),
      captureScreenshot: true,
      includeMobile: true,
    });

    expect(prefs).toEqual({
      mode: "deep",
      includeMobile: true,
    });
    expect(DEFAULT_PREFS).not.toHaveProperty("captureScreenshot");
    expect(prefs).not.toHaveProperty("captureScreenshot");
  });

  it("keeps mobile scan permission requests origin-scoped", () => {
    expect(
      mobileScanPermissionPattern(
        {},
        "https://example.com/products",
      ),
    ).toBe("https://example.com/*");
  });

  it("adds agent workflow instructions and finding evidence to markdown reports", () => {
    const markdown = buildMarkdownReport(sampleAudit);

    expect(markdown).toContain("## Fix with an agent");
    expect(markdown).toContain("Follow the accessibility fix guidance in this report");
    expect(markdown).toContain("Confirmed Findings");
    expect(markdown).toContain("Needs Review");
    expect(markdown).toContain("selector: `img.hero`");
    expect(markdown).toContain("WCAG: 1.1.1");
    expect(markdown).toContain("Engines: axe-core");
    expect(markdown).toContain("https://dequeuniversity.com/rules/axe/4.11/image-alt");
    expect(markdown).toContain("https://squizlabs.github.io/HTML_CodeSniffer/Standards/WCAG2AA/");
  });

  it("builds a standalone AGENTS.md with severity-prioritized fixes and references", () => {
    const markdown = buildAgentPlanMarkdown(sampleAudit);

    expect(markdown).toContain("# AGENTS.md");
    expect(markdown).toContain("Follow this plan to fix accessibility findings");
    expect(markdown).toContain("## Critical Fixes");
    expect(markdown).toContain("Find the source that renders `img.hero`");
    expect(markdown).toContain("WCAG: 1.1.1");
    expect(markdown).toContain("Reference: https://dequeuniversity.com/rules/axe/4.11/image-alt");
    expect(markdown).toContain("## Needs Review Signals");
    expect(markdown).toContain("Verify `WCAG2AA.Principle1.Guideline1_4.1_4_3.G18.Fail`");
  });
});
