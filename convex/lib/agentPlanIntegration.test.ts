import { describe, it, expect } from "vitest";
import { groupViolations } from "./groupViolations";
import { buildAgentPlanPrompt } from "./buildAgentPlanPrompt";

/**
 * Integration test: exercises the full pipeline from raw axe-core violations
 * through grouping → prompt building → verifying the prompt structure that
 * would be sent to OpenAI.
 *
 * The OpenAI call itself is not made — we verify the prompt is well-formed
 * and then validate that a hypothetical model response has the expected
 * AGENTS.md structure.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Realistic axe-core violation fixtures
// ═══════════════════════════════════════════════════════════════════════════

const DESKTOP_VIOLATIONS = [
  {
    id: "color-contrast",
    impact: "serious" as const,
    description: "Ensures the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
    tags: ["cat.color", "wcag2aa", "wcag143", "TTv5", "TT13.c", "EN-301-549", "EN-9.1.4.3", "ACT"],
    nodes: [
      { target: [".hero-subtitle"], html: '<p class="hero-subtitle" style="color: #999">Welcome to our site</p>' },
      { target: [".footer-link"], html: '<a class="footer-link" href="/about">About</a>' },
    ],
  },
  {
    id: "image-alt",
    impact: "critical" as const,
    description: "Ensures <img> elements have alternate text or a role of none or presentation",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
    tags: ["cat.text-alternatives", "wcag2a", "wcag111", "section508", "section508.22.a", "TTv5", "TT7.a", "TT7.b", "EN-301-549", "EN-9.1.1.1", "ACT"],
    nodes: [
      { target: ["img.hero-image"], html: '<img class="hero-image" src="/hero.jpg">' },
    ],
  },
  {
    id: "link-name",
    impact: "serious" as const,
    description: "Ensures links have discernible text",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/link-name",
    tags: ["cat.name-role-value", "wcag2a", "wcag244", "wcag412", "section508", "section508.22.a", "TTv5", "TT6.a", "EN-301-549", "EN-9.2.4.4", "EN-9.4.1.2", "ACT"],
    nodes: [
      { target: ["a.icon-link"], html: '<a class="icon-link" href="/settings"><svg>...</svg></a>' },
    ],
  },
];

const MOBILE_VIOLATIONS = [
  {
    id: "color-contrast",
    impact: "serious" as const,
    description: "Ensures the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
    tags: ["cat.color", "wcag2aa", "wcag143"],
    nodes: [
      { target: [".mobile-nav-text"], html: '<span class="mobile-nav-text">Menu</span>' },
    ],
  },
  {
    id: "button-name",
    impact: "critical" as const,
    description: "Ensures buttons have discernible text",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/button-name",
    tags: ["cat.name-role-value", "wcag2a", "wcag412"],
    nodes: [
      { target: ["button.hamburger"], html: '<button class="hamburger"><svg>...</svg></button>' },
    ],
  },
];

const MOCK_AGENTS_MD = `# AGENTS.md — Accessibility Fix Plan

**Site:** https://example.com
**Audit Date:** 2026-03-03
**Framework:** Next.js

## Overview

This plan addresses 4 accessibility violations found during an automated WCAG 2.2 audit.

## Critical Fixes

### 1. Add alt text to hero image
Find the component rendering \`img.hero-image\`. Add a descriptive \`alt\` attribute.

### 2. Add accessible name to hamburger button
Find the component rendering \`button.hamburger\`. Add \`aria-label="Open menu"\`.

## Serious Fixes

### 3. Fix color contrast
Find elements matching \`.hero-subtitle\` and \`.footer-link\`. Ensure foreground/background contrast ratio meets 4.5:1.

### 4. Add link text
Find the component rendering \`a.icon-link\`. Add visually hidden text or \`aria-label\`.

## Verification Steps

- Run axe-core locally to confirm violations are resolved
- Test with a screen reader (VoiceOver / NVDA)
- Check color contrast with browser DevTools

## Don'ts

- Don't use \`aria-hidden="true"\` on interactive elements
- Don't add redundant alt text like "image" or "photo"
- Don't remove focus indicators
`;

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("Agent Plan Integration", () => {
  describe("full pipeline: violations → grouping → prompt → output validation", () => {
    it("groups and merges desktop + mobile violations correctly", () => {
      const grouped = groupViolations(DESKTOP_VIOLATIONS, MOBILE_VIOLATIONS);

      const ruleIds = grouped.map((g) => g.ruleId);
      expect(ruleIds).toContain("color-contrast");
      expect(ruleIds).toContain("image-alt");
      expect(ruleIds).toContain("link-name");
      expect(ruleIds).toContain("button-name");

      // color-contrast should be merged from both viewports
      const cc = grouped.find((g) => g.ruleId === "color-contrast")!;
      expect(cc.nodeCount).toBe(3); // 2 desktop + 1 mobile
      expect(cc.selectors).toContain(".hero-subtitle");
      expect(cc.selectors).toContain(".mobile-nav-text");
    });

    it("sorts by impact (critical first) after grouping", () => {
      const grouped = groupViolations(DESKTOP_VIOLATIONS, MOBILE_VIOLATIONS);

      const criticalIdx = grouped.findIndex((g) => g.impact === "critical");
      const seriousIdx = grouped.findIndex((g) => g.impact === "serious");
      expect(criticalIdx).toBeLessThan(seriousIdx);
    });

    it("builds a well-formed prompt from grouped violations", () => {
      const grouped = groupViolations(DESKTOP_VIOLATIONS, MOBILE_VIOLATIONS);

      const { systemPrompt, userPrompt } = buildAgentPlanPrompt({
        violations: grouped,
        platform: "nextjs",
        url: "https://example.com",
        auditDate: "2026-03-03",
        pageTitle: "Example Site",
      });

      // System prompt structure
      expect(systemPrompt).toContain("Critical Fixes");
      expect(systemPrompt).toContain("Verification");
      expect(systemPrompt).toContain("Don't");
      expect(systemPrompt).toContain("AGENTS.md");

      // User prompt contains framework
      expect(userPrompt).toContain("Next.js");

      // User prompt contains the URL and audit date
      expect(userPrompt).toContain("https://example.com");
      expect(userPrompt).toContain("2026-03-03");

      // User prompt includes all violations
      expect(userPrompt).toContain("color-contrast");
      expect(userPrompt).toContain("image-alt");
      expect(userPrompt).toContain("link-name");
      expect(userPrompt).toContain("button-name");

      // User prompt includes page title
      expect(userPrompt).toContain("Example Site");

      // Size constraint
      const total = systemPrompt.length + userPrompt.length;
      expect(total).toBeLessThan(12000);
    });
  });

  describe("mocked AGENTS.md output validation", () => {
    it("contains the site URL", () => {
      expect(MOCK_AGENTS_MD).toContain("https://example.com");
    });

    it("contains at least one fix instruction section", () => {
      expect(MOCK_AGENTS_MD).toMatch(/## Critical Fixes|## Serious Fixes|## Moderate Fixes/);
    });

    it("contains a Verification section", () => {
      expect(MOCK_AGENTS_MD).toContain("## Verification");
    });

    it("contains a Don'ts section", () => {
      expect(MOCK_AGENTS_MD).toContain("## Don't");
    });

    it("contains framework-specific references (Next.js)", () => {
      expect(MOCK_AGENTS_MD).toContain("Next.js");
    });

    it("contains imperative fix instructions", () => {
      expect(MOCK_AGENTS_MD).toMatch(/Find the component|Add .*aria-label|Ensure/);
    });
  });

  describe("edge case: empty violations produce empty grouping", () => {
    it("returns empty groups for empty desktop + empty mobile", () => {
      const grouped = groupViolations([], []);
      expect(grouped).toEqual([]);
    });
  });

  describe("edge case: desktop-only (no mobile)", () => {
    it("groups correctly with only desktop violations", () => {
      const grouped = groupViolations(DESKTOP_VIOLATIONS);
      expect(grouped.length).toBe(3);

      const { userPrompt } = buildAgentPlanPrompt({
        violations: grouped,
        platform: "astro",
        url: "https://mysite.dev",
        auditDate: "2026-01-15",
      });

      expect(userPrompt).toContain("Astro");
      expect(userPrompt).toContain("https://mysite.dev");
    });
  });
});
