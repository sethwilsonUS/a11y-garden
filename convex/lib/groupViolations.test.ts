import { describe, it, expect } from "vitest";
import { groupViolations } from "./groupViolations";

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — minimal axe-core violation fixtures
// ═══════════════════════════════════════════════════════════════════════════

function makeViolation(overrides: {
  id: string;
  impact?: "critical" | "serious" | "moderate" | "minor";
  description?: string;
  helpUrl?: string;
  tags?: string[];
  nodes?: Array<{ target: string[]; html: string }>;
}) {
  return {
    id: overrides.id,
    impact: overrides.impact ?? "moderate",
    description: overrides.description ?? `Description for ${overrides.id}`,
    helpUrl: overrides.helpUrl ?? `https://dequeuniversity.com/rules/${overrides.id}`,
    tags: overrides.tags ?? ["wcag2a", "wcag412"],
    nodes: overrides.nodes ?? [
      { target: ["#node-1"], html: `<div id="node-1"></div>` },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUPING
// ═══════════════════════════════════════════════════════════════════════════

describe("groupViolations", () => {
  describe("grouping by rule ID", () => {
    it("groups violations with the same id into a single entry", () => {
      const violations = [
        makeViolation({
          id: "color-contrast",
          nodes: [{ target: [".a"], html: "<p class='a'>low</p>" }],
        }),
        makeViolation({
          id: "color-contrast",
          nodes: [{ target: [".b"], html: "<p class='b'>low</p>" }],
        }),
      ];

      const result = groupViolations(violations);

      const colorContrastGroups = result.filter(
        (g) => g.ruleId === "color-contrast",
      );
      expect(colorContrastGroups).toHaveLength(1);
      expect(colorContrastGroups[0].selectors).toContain(".a");
      expect(colorContrastGroups[0].selectors).toContain(".b");
      expect(colorContrastGroups[0].nodeCount).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DEDUPLICATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("selector deduplication", () => {
    it("deduplicates identical CSS selectors within a group", () => {
      const violations = [
        makeViolation({
          id: "image-alt",
          nodes: [
            { target: ["img.hero"], html: "<img class='hero'>" },
            { target: ["img.hero"], html: "<img class='hero'>" },
            { target: ["img.logo"], html: "<img class='logo'>" },
          ],
        }),
      ];

      const result = groupViolations(violations);

      const group = result.find((g) => g.ruleId === "image-alt")!;
      expect(group.selectors).toHaveLength(2);
      expect(group.selectors).toContain("img.hero");
      expect(group.selectors).toContain("img.logo");
      // nodeCount reflects total nodes, not unique selectors
      expect(group.nodeCount).toBe(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SORTING
  // ═══════════════════════════════════════════════════════════════════════════

  describe("impact sorting", () => {
    it("sorts groups by impact: critical first, minor last", () => {
      const violations = [
        makeViolation({ id: "minor-rule", impact: "minor" }),
        makeViolation({ id: "critical-rule", impact: "critical" }),
        makeViolation({ id: "moderate-rule", impact: "moderate" }),
        makeViolation({ id: "serious-rule", impact: "serious" }),
      ];

      const result = groupViolations(violations);

      expect(result[0].impact).toBe("critical");
      expect(result[1].impact).toBe("serious");
      expect(result[2].impact).toBe("moderate");
      expect(result[3].impact).toBe("minor");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MAX CAP
  // ═══════════════════════════════════════════════════════════════════════════

  describe("max groups cap", () => {
    it("caps output at the configured max (default 30)", () => {
      const violations = Array.from({ length: 40 }, (_, i) =>
        makeViolation({ id: `rule-${i}` }),
      );

      const result = groupViolations(violations);

      expect(result.length).toBeLessThanOrEqual(30);
    });

    it("respects a custom max parameter", () => {
      const violations = Array.from({ length: 20 }, (_, i) =>
        makeViolation({ id: `rule-${i}` }),
      );

      const result = groupViolations(violations, undefined, 5);

      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FIELD PRESERVATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("field preservation", () => {
    it("preserves WCAG tags and helpUrl accurately", () => {
      const violations = [
        makeViolation({
          id: "aria-label",
          tags: ["wcag2a", "wcag412", "cat.aria"],
          helpUrl: "https://dequeuniversity.com/rules/aria-label",
        }),
      ];

      const result = groupViolations(violations);
      const group = result.find((g) => g.ruleId === "aria-label")!;

      expect(group.wcagTags).toEqual(["wcag2a", "wcag412", "cat.aria"]);
      expect(group.helpUrl).toBe(
        "https://dequeuniversity.com/rules/aria-label",
      );
    });

    it("preserves description accurately", () => {
      const violations = [
        makeViolation({
          id: "link-name",
          description: "Ensures links have discernible text",
        }),
      ];

      const result = groupViolations(violations);

      expect(result[0].description).toBe(
        "Ensures links have discernible text",
      );
    });

    it("preserves HTML snippets", () => {
      const violations = [
        makeViolation({
          id: "button-name",
          nodes: [
            { target: ["button.submit"], html: "<button class='submit'></button>" },
          ],
        }),
      ];

      const result = groupViolations(violations);

      expect(result[0].htmlSnippets).toContain(
        "<button class='submit'></button>",
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  describe("edge cases", () => {
    it("handles empty violations array gracefully", () => {
      const result = groupViolations([]);

      expect(result).toEqual([]);
    });

    it("handles violations with missing helpUrl without throwing", () => {
      const violations = [
        {
          id: "some-rule",
          impact: "moderate" as const,
          description: "Some rule",
          tags: ["wcag2a"],
          nodes: [{ target: [".a"], html: "<div></div>" }],
        },
      ];

      expect(() => groupViolations(violations)).not.toThrow();

      const result = groupViolations(violations);
      expect(result[0].ruleId).toBe("some-rule");
      expect(result[0].helpUrl).toBe("");
    });

    it("handles violations with missing tags without throwing", () => {
      const violations = [
        {
          id: "some-rule",
          impact: "moderate" as const,
          description: "Some rule",
          helpUrl: "https://example.com",
          nodes: [{ target: [".a"], html: "<div></div>" }],
        },
      ];

      expect(() => groupViolations(violations)).not.toThrow();

      const result = groupViolations(violations);
      expect(result[0].wcagTags).toEqual([]);
    });

    it("handles nodes with multi-segment selectors (joins with space)", () => {
      const violations = [
        makeViolation({
          id: "nested-rule",
          nodes: [
            { target: ["#main", ".content", "p"], html: "<p>text</p>" },
          ],
        }),
      ];

      const result = groupViolations(violations);

      expect(result[0].selectors).toContain("#main .content p");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MERGING DESKTOP + MOBILE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("merging desktop and mobile violations", () => {
    it("merges desktop + mobile violations when both are provided", () => {
      const desktop = [
        makeViolation({
          id: "color-contrast",
          nodes: [{ target: [".desktop-el"], html: "<p class='desktop-el'>text</p>" }],
        }),
      ];
      const mobile = [
        makeViolation({
          id: "color-contrast",
          nodes: [{ target: [".mobile-el"], html: "<p class='mobile-el'>text</p>" }],
        }),
      ];

      const result = groupViolations(desktop, mobile);

      const group = result.find((g) => g.ruleId === "color-contrast")!;
      expect(group.selectors).toContain(".desktop-el");
      expect(group.selectors).toContain(".mobile-el");
      expect(group.nodeCount).toBe(2);
    });

    it("handles mobile-only violations that don't exist in desktop", () => {
      const desktop = [
        makeViolation({ id: "color-contrast" }),
      ];
      const mobile = [
        makeViolation({ id: "tap-target-size", impact: "serious" }),
      ];

      const result = groupViolations(desktop, mobile);

      const ruleIds = result.map((g) => g.ruleId);
      expect(ruleIds).toContain("color-contrast");
      expect(ruleIds).toContain("tap-target-size");
    });

    it("works correctly when mobile array is undefined", () => {
      const desktop = [
        makeViolation({ id: "image-alt" }),
      ];

      const result = groupViolations(desktop, undefined);

      expect(result).toHaveLength(1);
      expect(result[0].ruleId).toBe("image-alt");
    });

    it("works correctly when mobile array is empty", () => {
      const desktop = [
        makeViolation({ id: "image-alt" }),
      ];

      const result = groupViolations(desktop, []);

      expect(result).toHaveLength(1);
      expect(result[0].ruleId).toBe("image-alt");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // OUTPUT SHAPE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("output shape", () => {
    it("returns GroupedViolation objects with all required fields", () => {
      const violations = [
        makeViolation({ id: "link-name", impact: "serious" }),
      ];

      const result = groupViolations(violations);

      expect(result).toHaveLength(1);
      const group = result[0];
      expect(group).toHaveProperty("ruleId");
      expect(group).toHaveProperty("impact");
      expect(group).toHaveProperty("description");
      expect(group).toHaveProperty("helpUrl");
      expect(group).toHaveProperty("wcagTags");
      expect(group).toHaveProperty("selectors");
      expect(group).toHaveProperty("htmlSnippets");
      expect(group).toHaveProperty("nodeCount");
      expect(typeof group.ruleId).toBe("string");
      expect(typeof group.impact).toBe("string");
      expect(typeof group.description).toBe("string");
      expect(typeof group.helpUrl).toBe("string");
      expect(Array.isArray(group.wcagTags)).toBe(true);
      expect(Array.isArray(group.selectors)).toBe(true);
      expect(Array.isArray(group.htmlSnippets)).toBe(true);
      expect(typeof group.nodeCount).toBe("number");
    });
  });
});
