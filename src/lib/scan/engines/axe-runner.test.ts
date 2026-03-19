import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { runAxeOnPage } from "./axe-runner";

const { getAxeCoreSource } = vi.hoisted(() => ({
  getAxeCoreSource: vi.fn(),
}));

vi.mock("./source-cache", () => ({
  getAxeCoreSource,
}));

function installAxeMock(run: ReturnType<typeof vi.fn>) {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  const axe = {
    reset: vi.fn(),
    run,
  };

  Object.assign(globalThis, {
    window: { axe },
    document: { body: { nodeName: "BODY" } },
  });

  return {
    axe,
    restore() {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
    },
  };
}

describe("runAxeOnPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAxeCoreSource.mockResolvedValue("window.axe = window.axe;");
  });

  it("disables element refs on the primary full scan", async () => {
    const run = vi.fn().mockResolvedValue({
      violations: [],
      passes: [{ id: "image-alt" }],
    });
    const { axe, restore } = installAxeMock(run);

    const page = {
      evaluate: vi.fn(async (arg: unknown) => {
        if (typeof arg === "string") return undefined;
        if (typeof arg === "function") return await arg();
        return undefined;
      }),
    } as unknown as Page;

    try {
      const result = await runAxeOnPage(page);

      expect(axe.reset).toHaveBeenCalledOnce();
      expect(run).toHaveBeenCalledWith(
        globalThis.document.body,
        expect.objectContaining({
          resultTypes: ["violations"],
          elementRef: false,
        }),
      );
      expect(result.scanModeInfo.mode).toBe("full");
    } finally {
      restore();
    }
  });

  it("still falls back to safe-rules mode when the full scan fails", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("document too large"))
      .mockResolvedValueOnce({
        violations: [],
        passes: [],
      });
    const { restore } = installAxeMock(run);

    const page = {
      evaluate: vi.fn(async (arg: unknown, rules?: string[]) => {
        if (typeof arg === "string") return undefined;
        if (typeof arg === "function") return await arg(rules);
        return undefined;
      }),
    } as unknown as Page;

    try {
      const result = await runAxeOnPage(page);

      expect(run).toHaveBeenNthCalledWith(
        2,
        globalThis.document.body,
        expect.objectContaining({
          runOnly: expect.objectContaining({
            type: "rule",
            values: expect.any(Array),
          }),
          elementRef: false,
        }),
      );
      expect(result.scanModeInfo.mode).toBe("safe-rules");
      expect(result.scanModeInfo.reason).toContain("document too large");
    } finally {
      restore();
    }
  });
});
