import { describe, it, expect } from "vitest";
import {
  truncateViolations,
  ScanBlockedError,
  type AxeViolationRaw,
  type ScanResult,
  type ScanOptions,
} from "./scanner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fake violation with N nodes, each containing some bulk text. */
function makeViolation(
  id: string,
  nodeCount: number,
  impact = "serious",
): AxeViolationRaw {
  return {
    id,
    impact,
    description: `Description for ${id}`,
    help: `Help text for ${id}`,
    helpUrl: `https://dequeuniversity.com/rules/axe/4.10/${id}`,
    tags: ["wcag2a"],
    nodes: Array.from({ length: nodeCount }, (_, i) => ({
      html: `<div class="element-${i}" data-testid="test-${id}-${i}">Some content that takes up space in the payload for testing truncation behavior</div>`,
      target: [`.element-${i}`],
      failureSummary: `Fix the following:\n  Element must have alt text\n  Element must have a title`,
    })),
  };
}

// ---------------------------------------------------------------------------
// truncateViolations
// ---------------------------------------------------------------------------

describe("truncateViolations", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // SMALL PAYLOADS (NO TRUNCATION)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("small payloads (no truncation needed)", () => {
    it("returns serialized JSON for empty array", () => {
      const result = truncateViolations([]);

      expect(result.serialized).toBe("[]");
      expect(result.truncated).toBe(false);
    });

    it("does not truncate small violations", () => {
      const violations = [makeViolation("image-alt", 3)];
      const result = truncateViolations(violations);

      expect(result.truncated).toBe(false);
      const parsed = JSON.parse(result.serialized);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].nodes).toHaveLength(3);
    });

    it("preserves all data when under the size cap", () => {
      const violations = [
        makeViolation("image-alt", 5, "critical"),
        makeViolation("link-name", 3, "serious"),
        makeViolation("heading-order", 2, "moderate"),
      ];
      const result = truncateViolations(violations);

      expect(result.truncated).toBe(false);
      const parsed = JSON.parse(result.serialized);
      expect(parsed).toHaveLength(3);
      expect(parsed[0].nodes).toHaveLength(5);
      expect(parsed[1].nodes).toHaveLength(3);
      expect(parsed[2].nodes).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LARGE PAYLOADS (TRUNCATION REQUIRED)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("large payloads (truncation required)", () => {
    it("truncates violations that exceed the 500KB cap", () => {
      // Create a violation with thousands of nodes to exceed 512,000 chars
      const violations = [makeViolation("image-alt", 5000)];
      const result = truncateViolations(violations);

      expect(result.truncated).toBe(true);
      expect(result.serialized.length).toBeLessThanOrEqual(512_000);
    });

    it("keeps at least one node per violation after truncation", () => {
      const violations = [
        makeViolation("image-alt", 3000),
        makeViolation("link-name", 3000),
      ];
      const result = truncateViolations(violations);

      expect(result.truncated).toBe(true);
      const parsed = JSON.parse(result.serialized);
      expect(parsed).toHaveLength(2);
      // Each violation should still have at least 1 node
      expect(parsed[0].nodes.length).toBeGreaterThanOrEqual(1);
      expect(parsed[1].nodes.length).toBeGreaterThanOrEqual(1);
    });

    it("trims the violation with the most nodes first", () => {
      const violations = [
        makeViolation("small", 2),
        makeViolation("large", 5000),
      ];
      const result = truncateViolations(violations);

      expect(result.truncated).toBe(true);
      const parsed = JSON.parse(result.serialized);
      // The small violation should be untouched
      expect(parsed[0].nodes).toHaveLength(2);
      // The large violation was trimmed
      expect(parsed[1].nodes.length).toBeLessThan(5000);
    });

    it("produces valid JSON output", () => {
      const violations = [makeViolation("image-alt", 5000)];
      const result = truncateViolations(violations);

      expect(() => JSON.parse(result.serialized)).not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  describe("edge cases", () => {
    it("handles violations with 0 nodes", () => {
      const violations: AxeViolationRaw[] = [
        { id: "test", impact: "minor", nodes: [] },
      ];
      const result = truncateViolations(violations);

      expect(result.truncated).toBe(false);
      const parsed = JSON.parse(result.serialized);
      expect(parsed[0].nodes).toHaveLength(0);
    });

    it("handles violations with exactly 1 node (cannot be trimmed further)", () => {
      const violations: AxeViolationRaw[] = [
        {
          id: "test",
          impact: "minor",
          nodes: [{ html: "<div>x</div>", target: ["div"] }],
        },
      ];
      const result = truncateViolations(violations);

      const parsed = JSON.parse(result.serialized);
      expect(parsed[0].nodes).toHaveLength(1);
    });

    it("does not mutate the input array", () => {
      const violations = [makeViolation("image-alt", 5000)];
      const originalNodeCount = violations[0].nodes.length;

      truncateViolations(violations);

      expect(violations[0].nodes.length).toBe(originalNodeCount);
    });
  });
});

// ---------------------------------------------------------------------------
// ScanBlockedError
// ---------------------------------------------------------------------------

describe("ScanBlockedError", () => {
  it("is an instance of Error", () => {
    const error = new ScanBlockedError("blocked", "Test Page", 403);

    expect(error).toBeInstanceOf(Error);
  });

  it("has correct name", () => {
    const error = new ScanBlockedError("blocked", "Test Page", 403);

    expect(error.name).toBe("ScanBlockedError");
  });

  it("stores the message", () => {
    const error = new ScanBlockedError("Firewall blocked", "Test Page", 403);

    expect(error.message).toBe("Firewall blocked");
  });

  it("stores pageTitle", () => {
    const error = new ScanBlockedError("blocked", "Cloudflare Challenge", 403);

    expect(error.pageTitle).toBe("Cloudflare Challenge");
  });

  it("stores httpStatus", () => {
    const error = new ScanBlockedError("blocked", "Test", 503);

    expect(error.httpStatus).toBe(503);
  });

  it("has blocked flag set to true", () => {
    const error = new ScanBlockedError("blocked", "Test", 403);

    expect(error.blocked).toBe(true);
  });

  it("works with instanceof checks", () => {
    const error: Error = new ScanBlockedError("blocked", "Test", 403);

    if (error instanceof ScanBlockedError) {
      expect(error.pageTitle).toBe("Test");
      expect(error.httpStatus).toBe(403);
    } else {
      // Should not reach here
      expect.unreachable("Should be instanceof ScanBlockedError");
    }
  });
});

// ---------------------------------------------------------------------------
// ScanResult & ScanOptions type contracts
// ---------------------------------------------------------------------------
// These tests verify the type contracts are maintained (screenshot fields are
// optional and don't break existing consumers).

describe("ScanResult type contract", () => {
  it("allows ScanResult without screenshot (backwards-compatible)", () => {
    const result: ScanResult = {
      violations: { critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 },
      rawViolations: "[]",
      pageTitle: "Test",
      safeMode: false,
      truncated: false,
    };

    expect(result.screenshot).toBeUndefined();
  });

  it("allows ScanResult with screenshot buffer", () => {
    const fakeScreenshot = Buffer.from("fake-jpeg-data");
    const result: ScanResult = {
      violations: { critical: 1, serious: 0, moderate: 0, minor: 0, total: 1 },
      rawViolations: "[]",
      pageTitle: "Test",
      safeMode: false,
      truncated: false,
      screenshot: fakeScreenshot,
    };

    expect(result.screenshot).toBe(fakeScreenshot);
    expect(result.screenshot).toBeInstanceOf(Buffer);
  });
});

describe("ScanOptions type contract", () => {
  it("allows ScanOptions without captureScreenshot (backwards-compatible)", () => {
    const opts: ScanOptions = {};

    expect(opts.captureScreenshot).toBeUndefined();
  });

  it("allows ScanOptions with captureScreenshot flag", () => {
    const opts: ScanOptions = { captureScreenshot: true };

    expect(opts.captureScreenshot).toBe(true);
  });

  it("allows combining browserWSEndpoint and captureScreenshot", () => {
    const opts: ScanOptions = {
      browserWSEndpoint: "ws://localhost:3001",
      captureScreenshot: true,
    };

    expect(opts.browserWSEndpoint).toBe("ws://localhost:3001");
    expect(opts.captureScreenshot).toBe(true);
  });
});
