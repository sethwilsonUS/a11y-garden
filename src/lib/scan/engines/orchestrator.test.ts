import { beforeEach, describe, expect, it, vi } from "vitest";

const runAxeOnDom = vi.fn();
const runHtmlcsOnDom = vi.fn();
const runAceOnDom = vi.fn();

vi.mock("./axe-runner", () => ({
  runAxeOnDom,
  runAxeOnPage: vi.fn(),
}));

vi.mock("./htmlcs-runner", () => ({
  runHtmlcsOnDom,
  runHtmlcsOnPage: vi.fn(),
}));

vi.mock("./ace-runner", () => ({
  runAceOnDom,
  runAceOnPage: vi.fn(),
}));

describe("runEnginesOnHtml", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runAxeOnDom.mockResolvedValue({
      findings: [],
      legacyViolations: [],
      scanModeInfo: {
        mode: "jsdom-structural",
        rulesRun: 12,
        skippedCategories: [],
      },
      rulesRun: 12,
    });
  });

  it("skips htmlcs and ace in jsdom structural scans", async () => {
    const { runEnginesOnHtml } = await import("./orchestrator");

    const result = await runEnginesOnHtml(
      "<html><body><main>Hello</main></body></html>",
      "https://example.com",
      "comprehensive",
      ["image-alt"],
    );

    expect(runAxeOnDom).toHaveBeenCalledOnce();
    expect(runHtmlcsOnDom).not.toHaveBeenCalled();
    expect(runAceOnDom).not.toHaveBeenCalled();

    expect(result.engineSummary.selectedEngines).toEqual([
      "axe",
      "htmlcs",
      "ace",
    ]);
    expect(result.engineSummary.engines).toEqual([
      {
        engine: "axe",
        status: "completed",
        durationMs: expect.any(Number),
        confirmedCount: 0,
        reviewCount: 0,
        note: "Server-side structural scan",
      },
      {
        engine: "htmlcs",
        status: "skipped",
        durationMs: 0,
        confirmedCount: 0,
        reviewCount: 0,
        note: expect.stringContaining("JSDOM lacks reliable CSS"),
      },
      {
        engine: "ace",
        status: "skipped",
        durationMs: 0,
        confirmedCount: 0,
        reviewCount: 0,
        note: expect.stringContaining("JSDOM lacks reliable CSS"),
      },
    ]);
  });
});
