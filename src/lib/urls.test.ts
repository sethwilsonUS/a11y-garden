import { describe, it, expect } from "vitest";
import { buildResultsUrl, slugifyUrl, parseResultsSegments } from "./urls";

// ---------------------------------------------------------------------------
// slugifyUrl
// ---------------------------------------------------------------------------

describe("slugifyUrl", () => {
  it("returns just the hostname for root paths", () => {
    expect(slugifyUrl("https://example.com")).toBe("example.com");
    expect(slugifyUrl("https://example.com/")).toBe("example.com");
  });

  it("replaces path separators with dashes", () => {
    expect(slugifyUrl("https://t3.gg/blog")).toBe("t3.gg-blog");
  });

  it("handles multi-level paths", () => {
    expect(slugifyUrl("https://github.com/vercel/next.js")).toBe(
      "github.com-vercel-next.js",
    );
  });

  it("handles subdomains", () => {
    expect(slugifyUrl("https://docs.github.com/en/pages")).toBe(
      "docs.github.com-en-pages",
    );
  });

  it("strips trailing slashes", () => {
    expect(slugifyUrl("https://t3.gg/blog/")).toBe("t3.gg-blog");
  });

  it("ignores query strings and fragments", () => {
    expect(slugifyUrl("https://example.com/page?q=1#section")).toBe(
      "example.com-page",
    );
  });

  it("encodes special characters", () => {
    expect(slugifyUrl("http://localhost:3000/test")).toBe(
      "localhost%3A3000-test",
    );
  });

  it("handles invalid URLs gracefully via fallback", () => {
    expect(slugifyUrl("not-a-url")).toBe("not-a-url");
  });
});

// ---------------------------------------------------------------------------
// buildResultsUrl
// ---------------------------------------------------------------------------

describe("buildResultsUrl", () => {
  it("builds a pretty URL with site slug, date, and audit ID", () => {
    const scannedAt = new Date("2026-02-20T12:30:00Z").getTime();

    expect(buildResultsUrl("https://github.com", scannedAt, "abc123")).toBe(
      "/results/github.com/2026-02-20/abc123",
    );
  });

  it("includes the path in the slug", () => {
    const scannedAt = new Date("2026-02-20T12:30:00Z").getTime();

    expect(buildResultsUrl("https://t3.gg/blog", scannedAt, "abc123")).toBe(
      "/results/t3.gg-blog/2026-02-20/abc123",
    );
  });

  it("distinguishes different pages on the same domain", () => {
    const scannedAt = new Date("2026-02-20T12:30:00Z").getTime();

    const blogUrl = buildResultsUrl("https://t3.gg/blog", scannedAt, "id1");
    const chatUrl = buildResultsUrl("https://t3.gg/chat", scannedAt, "id2");

    expect(blogUrl).not.toBe(chatUrl);
    expect(blogUrl).toContain("t3.gg-blog");
    expect(chatUrl).toContain("t3.gg-chat");
  });

  it("uses UTC date regardless of local timezone", () => {
    const scannedAt = new Date("2026-01-15T23:59:59Z").getTime();

    expect(buildResultsUrl("https://example.com", scannedAt, "xyz")).toBe(
      "/results/example.com/2026-01-15/xyz",
    );
  });

  it("pads single-digit months and days", () => {
    const scannedAt = new Date("2026-01-05T00:00:00Z").getTime();

    expect(buildResultsUrl("https://example.com", scannedAt, "id")).toBe(
      "/results/example.com/2026-01-05/id",
    );
  });
});

// ---------------------------------------------------------------------------
// parseResultsSegments
// ---------------------------------------------------------------------------

describe("parseResultsSegments", () => {
  describe("legacy format (single segment)", () => {
    it("returns the audit ID and marks as legacy", () => {
      const result = parseResultsSegments(["abc123"]);

      expect(result).toEqual({ auditId: "abc123", isLegacy: true });
    });
  });

  describe("new format (three segments)", () => {
    it("extracts the audit ID from the last segment", () => {
      const result = parseResultsSegments([
        "t3.gg-blog",
        "2026-02-20",
        "abc123",
      ]);

      expect(result).toEqual({ auditId: "abc123", isLegacy: false });
    });

    it("ignores the slug and date values (cosmetic only)", () => {
      const result = parseResultsSegments([
        "anything-here",
        "not-a-date",
        "the-real-id",
      ]);

      expect(result).toEqual({ auditId: "the-real-id", isLegacy: false });
    });
  });

  describe("unexpected segment counts", () => {
    it("handles two segments by using the last as audit ID", () => {
      const result = parseResultsSegments(["t3.gg-blog", "abc123"]);

      expect(result).toEqual({ auditId: "abc123", isLegacy: false });
    });

    it("handles more than three segments by using the last as audit ID", () => {
      const result = parseResultsSegments([
        "extra",
        "t3.gg-blog",
        "2026-02-20",
        "abc123",
      ]);

      expect(result).toEqual({ auditId: "abc123", isLegacy: false });
    });
  });
});
