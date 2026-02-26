import { describe, it, expect } from "vitest";
import { deduplicateByUrl } from "./dedup";

function audit(url: string, scannedAt: number, id = "") {
  return { url, scannedAt, id };
}

describe("deduplicateByUrl", () => {
  it("returns all audits when every URL is unique", () => {
    const audits = [
      audit("https://a.com/", 100),
      audit("https://b.com/", 200),
      audit("https://c.com/", 300),
    ];

    expect(deduplicateByUrl(audits)).toEqual(audits);
  });

  it("keeps the audit with the highest scannedAt for duplicate URLs", () => {
    const old = audit("https://a.com/", 100, "old");
    const newer = audit("https://a.com/", 200, "newer");
    const newest = audit("https://a.com/", 300, "newest");

    const result = deduplicateByUrl([old, newer, newest]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("newest");
  });

  it("handles input where the newest comes first", () => {
    const newest = audit("https://a.com/", 300, "newest");
    const older = audit("https://a.com/", 100, "older");

    const result = deduplicateByUrl([newest, older]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("newest");
  });

  it("deduplicates across multiple URLs independently", () => {
    const audits = [
      audit("https://a.com/", 100, "a-old"),
      audit("https://b.com/", 200, "b-old"),
      audit("https://a.com/", 300, "a-new"),
      audit("https://b.com/", 400, "b-new"),
    ];

    const result = deduplicateByUrl(audits);

    expect(result).toHaveLength(2);
    const ids = result.map((a) => a.id).sort();
    expect(ids).toEqual(["a-new", "b-new"]);
  });

  it("treats different paths on the same domain as separate URLs", () => {
    const audits = [
      audit("https://example.com/", 100, "root"),
      audit("https://example.com/about", 200, "about"),
    ];

    const result = deduplicateByUrl(audits);

    expect(result).toHaveLength(2);
  });

  it("returns an empty array for empty input", () => {
    expect(deduplicateByUrl([])).toEqual([]);
  });

  it("returns the single audit for a single-element input", () => {
    const only = audit("https://a.com/", 100, "only");
    expect(deduplicateByUrl([only])).toEqual([only]);
  });

  it("preserves all original fields on the winning audit", () => {
    const full = {
      url: "https://a.com/",
      scannedAt: 200,
      id: "winner",
      domain: "a.com",
      score: 95,
      letterGrade: "A" as const,
    };
    const loser = {
      url: "https://a.com/",
      scannedAt: 100,
      id: "loser",
      domain: "a.com",
      score: 50,
      letterGrade: "F" as const,
    };

    const result = deduplicateByUrl([loser, full]);

    expect(result[0]).toBe(full);
  });

  it("breaks ties deterministically (last-seen wins)", () => {
    const first = audit("https://a.com/", 100, "first");
    const second = audit("https://a.com/", 100, "second");

    const result = deduplicateByUrl([first, second]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("first");
  });
});
