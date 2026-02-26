import { describe, it, expect } from "vitest";
import { sortAudits, type SortOption } from "./audit-sort";

function audit(domain: string, scannedAt: number, score: number) {
  return { domain, scannedAt, score };
}

describe("sortAudits", () => {
  const audits = [
    audit("charlie.com", 300, 70),
    audit("alpha.com", 100, 90),
    audit("bravo.com", 200, 80),
  ];

  // ---------------------------------------------------------------------------
  // Sort by date
  // ---------------------------------------------------------------------------

  describe('sort by "date"', () => {
    it("sorts newest first (descending scannedAt)", () => {
      const result = sortAudits(audits, "date");

      expect(result.map((a) => a.scannedAt)).toEqual([300, 200, 100]);
    });

    it("is stable for equal timestamps", () => {
      const tied = [
        audit("a.com", 100, 50),
        audit("b.com", 100, 60),
      ];

      const result = sortAudits(tied, "date");

      expect(result.map((a) => a.domain)).toEqual(["a.com", "b.com"]);
    });
  });

  // ---------------------------------------------------------------------------
  // Sort by name
  // ---------------------------------------------------------------------------

  describe('sort by "name"', () => {
    it("sorts alphabetically by domain (A-Z)", () => {
      const result = sortAudits(audits, "name");

      expect(result.map((a) => a.domain)).toEqual([
        "alpha.com",
        "bravo.com",
        "charlie.com",
      ]);
    });

    it("is case-insensitive via localeCompare", () => {
      const mixed = [
        audit("Zebra.com", 1, 1),
        audit("apple.com", 2, 2),
      ];

      const result = sortAudits(mixed, "name");

      expect(result.map((a) => a.domain)).toEqual(["apple.com", "Zebra.com"]);
    });
  });

  // ---------------------------------------------------------------------------
  // Sort by score
  // ---------------------------------------------------------------------------

  describe('sort by "score"', () => {
    it("sorts highest score first (descending)", () => {
      const result = sortAudits(audits, "score");

      expect(result.map((a) => a.score)).toEqual([90, 80, 70]);
    });

    it("is stable for equal scores", () => {
      const tied = [
        audit("first.com", 100, 85),
        audit("second.com", 200, 85),
      ];

      const result = sortAudits(tied, "score");

      expect(result.map((a) => a.domain)).toEqual(["first.com", "second.com"]);
    });
  });

  // ---------------------------------------------------------------------------
  // General behaviour
  // ---------------------------------------------------------------------------

  describe("general behaviour", () => {
    it("does not mutate the original array", () => {
      const original = [...audits];
      sortAudits(audits, "date");
      expect(audits).toEqual(original);
    });

    it("returns an empty array for empty input", () => {
      expect(sortAudits([], "date")).toEqual([]);
    });

    it("returns a single-element array unchanged", () => {
      const single = [audit("only.com", 1, 100)];
      expect(sortAudits(single, "date")).toEqual(single);
    });

    it("returns a shallow copy for unknown sort option", () => {
      const result = sortAudits(audits, "unknown" as SortOption);
      expect(result).toEqual(audits);
      expect(result).not.toBe(audits);
    });
  });
});
