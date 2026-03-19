import { describe, it, expect } from "vitest";
import { buildAgentPlanPrompt } from "./buildAgentPlanPrompt";
import type { GroupedViolation } from "./groupViolations";

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function makeGroupedViolation(
  overrides: Partial<GroupedViolation> & { ruleId: string },
): GroupedViolation {
  return {
    title: overrides.ruleId.replace(/-/g, " "),
    impact: "moderate",
    description: `Description for ${overrides.ruleId}`,
    helpUrl: `https://dequeuniversity.com/rules/${overrides.ruleId}`,
    wcagTags: ["wcag2a", "wcag412"],
    selectors: [".some-element"],
    htmlSnippets: ["<div class='some-element'></div>"],
    nodeCount: 1,
    engines: ["axe"],
    viewports: ["desktop"],
    ...overrides,
  };
}

const BASE_INPUT = {
  violations: [
    makeGroupedViolation({ ruleId: "color-contrast", impact: "serious" }),
    makeGroupedViolation({ ruleId: "image-alt", impact: "critical" }),
  ],
  platform: "nextjs",
  url: "https://example.com",
  auditDate: "2026-03-03",
  totalConfirmedFindings: 2,
  totalGroupedIssues: 2,
};

// ═══════════════════════════════════════════════════════════════════════════
// RETURN SHAPE
// ═══════════════════════════════════════════════════════════════════════════

describe("buildAgentPlanPrompt", () => {
  describe("return shape", () => {
    it("returns an object with systemPrompt and userPrompt string keys", () => {
      const result = buildAgentPlanPrompt(BASE_INPUT);

      expect(result).toHaveProperty("systemPrompt");
      expect(result).toHaveProperty("userPrompt");
      expect(typeof result.systemPrompt).toBe("string");
      expect(typeof result.userPrompt).toBe("string");
      expect(result.systemPrompt.length).toBeGreaterThan(0);
      expect(result.userPrompt.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FRAMEWORK DISPLAY NAME
  // ═══════════════════════════════════════════════════════════════════════════

  describe("framework display name", () => {
    it("userPrompt contains the framework display name (Next.js not nextjs)", () => {
      const result = buildAgentPlanPrompt({ ...BASE_INPUT, platform: "nextjs" });

      expect(result.userPrompt).toContain("Next.js");
      expect(result.userPrompt).not.toMatch(/\bnextjs\b/);
    });

    it("maps astro to Astro", () => {
      const result = buildAgentPlanPrompt({ ...BASE_INPUT, platform: "astro" });

      expect(result.userPrompt).toContain("Astro");
    });

    it("maps remix to Remix", () => {
      const result = buildAgentPlanPrompt({ ...BASE_INPUT, platform: "remix" });

      expect(result.userPrompt).toContain("Remix");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIOLATION DATA
  // ═══════════════════════════════════════════════════════════════════════════

  describe("violation data in prompt", () => {
    it("userPrompt includes all critical violations in the prompt body", () => {
      const violations = [
        makeGroupedViolation({ ruleId: "image-alt", impact: "critical" }),
        makeGroupedViolation({ ruleId: "button-name", impact: "critical" }),
        makeGroupedViolation({ ruleId: "color-contrast", impact: "moderate" }),
      ];

      const result = buildAgentPlanPrompt({
        ...BASE_INPUT,
        violations,
      });

      expect(result.userPrompt).toContain("image-alt");
      expect(result.userPrompt).toContain("button-name");
    });

    it("uses the human-friendly title and rule id together", () => {
      const result = buildAgentPlanPrompt({
        ...BASE_INPUT,
        violations: [
          makeGroupedViolation({
            ruleId: "image-alt",
            title: "Images must have alternate text",
            impact: "critical",
          }),
        ],
      });

      expect(result.userPrompt).toContain("**Images must have alternate text** (`image-alt`)");
    });

    it("includes engine and viewport context when it adds signal", () => {
      const result = buildAgentPlanPrompt({
        ...BASE_INPUT,
        violations: [
          makeGroupedViolation({
            ruleId: "color-contrast",
            engines: ["axe", "ace"],
            viewports: ["desktop", "mobile"],
          }),
          makeGroupedViolation({
            ruleId: "button-name",
            engines: ["axe"],
            viewports: ["mobile"],
          }),
        ],
      });

      expect(result.userPrompt).toContain("Confirmed by: axe-core, IBM ACE");
      expect(result.userPrompt).toContain("Viewports: desktop and mobile");
      expect(result.userPrompt).toContain("Viewports: mobile");
    });

    it("userPrompt includes the target URL and audit date", () => {
      const result = buildAgentPlanPrompt({
        ...BASE_INPUT,
        url: "https://my-site.dev/page",
        auditDate: "2026-03-03",
      });

      expect(result.userPrompt).toContain("https://my-site.dev/page");
      expect(result.userPrompt).toContain("2026-03-03");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM PROMPT STRUCTURE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("system prompt structural keywords", () => {
    it("systemPrompt contains AGENTS.md structural keywords", () => {
      const result = buildAgentPlanPrompt(BASE_INPUT);

      expect(result.systemPrompt).toContain("Critical Fixes");
      expect(result.systemPrompt).toContain("Verification");
      expect(result.systemPrompt).toContain("Don't");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SIZE CONSTRAINT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("size constraint", () => {
    it("total prompt length stays under 12000 characters", () => {
      const result = buildAgentPlanPrompt(BASE_INPUT);
      const totalLength = result.systemPrompt.length + result.userPrompt.length;

      expect(totalLength).toBeLessThan(12000);
    });

    it("stays under 12000 characters even with many violations", () => {
      const violations = Array.from({ length: 30 }, (_, i) =>
        makeGroupedViolation({
          ruleId: `rule-${i}`,
          impact: i % 4 === 0 ? "critical" : "moderate",
          selectors: [`.el-${i}-a`, `.el-${i}-b`],
          htmlSnippets: [`<div class="el-${i}-a">content</div>`, `<div class="el-${i}-b">content</div>`],
          nodeCount: 2,
        }),
      );

      const result = buildAgentPlanPrompt({ ...BASE_INPUT, violations });
      const totalLength = result.systemPrompt.length + result.userPrompt.length;

      expect(totalLength).toBeLessThan(12000);
    });

    it("includes coverage notes when the prompt only includes a subset of grouped issues", () => {
      const result = buildAgentPlanPrompt({
        ...BASE_INPUT,
        totalConfirmedFindings: 18,
        totalGroupedIssues: 40,
        coverageNotes: ["Desktop engine coverage was partial: HTML_CodeSniffer skipped."],
      });

      expect(result.userPrompt).toContain("Grouped issues included in this prompt: 2 of 40 grouped issues");
      expect(result.userPrompt).toContain("## Coverage Notes");
      expect(result.userPrompt).toContain("Desktop engine coverage was partial");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UNKNOWN / GENERIC PLATFORM
  // ═══════════════════════════════════════════════════════════════════════════

  describe("unknown / generic platform", () => {
    it("handles unknown platform gracefully (falls back to generic web application)", () => {
      const result = buildAgentPlanPrompt({
        ...BASE_INPUT,
        platform: "unknown-framework-xyz",
      });

      expect(result.userPrompt).toContain("generic web application");
    });

    it("handles empty-string platform as generic", () => {
      const result = buildAgentPlanPrompt({
        ...BASE_INPUT,
        platform: "",
      });

      expect(result.userPrompt).toContain("generic web application");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HTML SNIPPET SANITIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("HTML snippet sanitization", () => {
    it("escapes or sanitizes HTML snippets so they don't break the markdown prompt", () => {
      const violations = [
        makeGroupedViolation({
          ruleId: "raw-html-test",
          htmlSnippets: [
            '<script>alert("xss")</script>',
            "<img src=x onerror=alert(1)>",
          ],
        }),
      ];

      const result = buildAgentPlanPrompt({ ...BASE_INPUT, violations });

      // Snippets should be wrapped in code fences or backticks so they
      // don't render as raw HTML in the markdown output
      expect(result.userPrompt).not.toMatch(
        /(?<!`)<script>alert\("xss"\)<\/script>(?!`)/,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIUM-CONFIDENCE HEDGE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("medium-confidence hedge", () => {
    it("includes medium-confidence hedge for react", () => {
      const result = buildAgentPlanPrompt({
        ...BASE_INPUT,
        platform: "react",
      });

      expect(result.userPrompt).toMatch(/not 100% certain|may not be accurate|appears to use/i);
    });

    it("includes medium-confidence hedge for vue", () => {
      const result = buildAgentPlanPrompt({
        ...BASE_INPUT,
        platform: "vue",
      });

      expect(result.userPrompt).toMatch(/not 100% certain|may not be accurate|appears to use/i);
    });

    it("includes medium-confidence hedge for svelte", () => {
      const result = buildAgentPlanPrompt({
        ...BASE_INPUT,
        platform: "svelte",
      });

      expect(result.userPrompt).toMatch(/not 100% certain|may not be accurate|appears to use/i);
    });

    it("does NOT include hedge for high-confidence platforms like nextjs", () => {
      const result = buildAgentPlanPrompt({
        ...BASE_INPUT,
        platform: "nextjs",
      });

      expect(result.userPrompt).not.toMatch(/not 100% certain|may not be accurate|appears to use/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIONAL pageTitle
  // ═══════════════════════════════════════════════════════════════════════════

  describe("optional pageTitle", () => {
    it("includes pageTitle in prompt when provided", () => {
      const result = buildAgentPlanPrompt({
        ...BASE_INPUT,
        pageTitle: "My Cool App — Dashboard",
      });

      expect(result.userPrompt).toContain("My Cool App — Dashboard");
    });

    it("works fine when pageTitle is omitted", () => {
      const result = buildAgentPlanPrompt(BASE_INPUT);

      expect(result.systemPrompt.length).toBeGreaterThan(0);
      expect(result.userPrompt.length).toBeGreaterThan(0);
    });
  });
});
