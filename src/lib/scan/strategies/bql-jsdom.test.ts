import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { ScanBlockedError } from "@/lib/scanner";
import type { StrategyScanResult, ScanStrategyOptions } from "./types";

vi.mock("../utils/adaptive-detect", () => ({
  detectAdaptiveServing: vi.fn(() => ({
    detected: true,
    reason: "Vary: User-Agent meta tag found",
  })),
}));

function makeOpts(
  overrides: Partial<ScanStrategyOptions> = {},
): ScanStrategyOptions {
  return {
    viewport: "mobile",
    captureScreenshot: true,
    engineProfile: "strict",
    timeBudgetMs: 240_000,
    isAuthenticated: true,
    ...overrides,
  };
}

function makeResult(
  overrides: Partial<StrategyScanResult> = {},
): StrategyScanResult {
  return {
    violations: { critical: 0, serious: 1, moderate: 0, minor: 0, total: 1 },
    reviewViolations: { critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 },
    rawFindings: "[{\"id\":\"demo\"}]",
    findingsVersion: 2,
    engineProfile: "strict",
    engineSummary: {
      selectedEngines: ["axe"],
      engines: [],
    },
    truncated: false,
    scanMode: {
      mode: "jsdom-structural",
      reason: "WAF bypass",
      rulesRun: 40,
      skippedCategories: [],
    },
    pageTitle: "Desktop title",
    ...overrides,
  };
}

describe("BqlJsdomStrategy", () => {
  const originalToken = process.env.BROWSERLESS_TOKEN;

  beforeEach(() => {
    process.env.BROWSERLESS_TOKEN = "test-token";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalToken) {
      process.env.BROWSERLESS_TOKEN = originalToken;
    } else {
      delete process.env.BROWSERLESS_TOKEN;
    }
  });

  it("falls back to cached desktop findings when adaptive mobile fetch fails", async () => {
    const { BqlJsdomStrategy } = await import("./bql-jsdom");
    const strategy = new BqlJsdomStrategy();
    const desktopScreenshot = Buffer.from("mobile-screenshot");
    const desktopResult = makeResult({
      screenshot: Buffer.from("desktop-screenshot"),
      warning: "Desktop warning",
    });

    (
      strategy as unknown as {
        desktopCache: {
          url: string;
          html: string;
          result: StrategyScanResult;
          mobileScreenshot?: Buffer;
        };
      }
    ).desktopCache = {
      url: "https://www.shutterstock.com",
      html: "<html></html>",
      result: desktopResult,
      mobileScreenshot: desktopScreenshot,
    };

    (
      strategy as unknown as {
        fetchHtml: ReturnType<typeof vi.fn>;
      }
    ).fetchHtml = vi.fn().mockRejectedValue(
      new ScanBlockedError("Still blocked", "Blocked", 403),
    );

    const result = await strategy.scan(
      "https://www.shutterstock.com",
      makeOpts(),
    );

    expect(result.violations).toEqual(desktopResult.violations);
    expect(result.rawFindings).toBe(desktopResult.rawFindings);
    expect(result.screenshot).toBe(desktopScreenshot);
    expect(result.warning).toContain("Adaptive serving detected");
    expect(result.warning).toContain("Using desktop findings instead.");
  });

  it("reuses the cached live mobile result after a comprehensive reconnect scan", async () => {
    const { BqlJsdomStrategy } = await import("./bql-jsdom");
    const strategy = new BqlJsdomStrategy();
    const url = "https://www.shutterstock.com";
    const desktopResult = makeResult({
      engineProfile: "comprehensive",
      scanMode: { mode: "full", rulesRun: 88, skippedCategories: [] },
      pageTitle: "Desktop live result",
    });
    const mobileResult = makeResult({
      engineProfile: "comprehensive",
      scanMode: { mode: "full", rulesRun: 88, skippedCategories: [] },
      pageTitle: "Mobile live result",
      warning: "Mobile live warning",
      screenshot: Buffer.from("mobile-live-screenshot"),
    });

    const fakeBrowser = {
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Browser;
    const fakePage = {
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    const internals = strategy as unknown as {
      fetchHtml: ReturnType<typeof vi.fn>;
      findConnectedPage: ReturnType<typeof vi.fn>;
      buildLiveResult: ReturnType<typeof vi.fn>;
      scanLiveMobile: ReturnType<typeof vi.fn>;
    };

    internals.fetchHtml = vi.fn().mockResolvedValue({
      content: "<html><title>Live</title></html>",
      pageTitle: "Live title",
      screenshotBase64: null,
      mobileScreenshotBase64: null,
      browserWSEndpoint: "ws://browserless/reconnect",
    });
    internals.findConnectedPage = vi
      .fn()
      .mockResolvedValue(fakePage);
    internals.buildLiveResult = vi.fn().mockResolvedValue(desktopResult);
    internals.scanLiveMobile = vi.fn().mockResolvedValue(mobileResult);

    const connectSpy = vi
      .spyOn(chromium, "connectOverCDP")
      .mockResolvedValue(fakeBrowser);

    const desktop = await strategy.scan(
      url,
      makeOpts({
        viewport: "desktop",
        engineProfile: "comprehensive",
      }),
    );
    const mobile = await strategy.scan(
      url,
      makeOpts({
        viewport: "mobile",
        engineProfile: "comprehensive",
      }),
    );

    expect(desktop).toBe(desktopResult);
    expect(mobile).toBe(mobileResult);
    expect(connectSpy).toHaveBeenCalledWith(
      "ws://browserless/reconnect?token=test-token",
    );
    expect(internals.fetchHtml).toHaveBeenCalledTimes(1);
    expect(internals.buildLiveResult).toHaveBeenCalledTimes(1);
    expect(internals.scanLiveMobile).toHaveBeenCalledTimes(1);
    expect(
      (
        strategy as unknown as {
          desktopCache: { mobileResult?: StrategyScanResult } | null;
        }
      ).desktopCache?.mobileResult,
    ).toBe(mobileResult);
  });

  it("falls back to the structural path when Browserless does not return a reconnect endpoint", async () => {
    const { BqlJsdomStrategy } = await import("./bql-jsdom");
    const strategy = new BqlJsdomStrategy();
    const structuralResult = makeResult({
      engineProfile: "comprehensive",
      scanMode: {
        mode: "jsdom-structural",
        reason: "WAF bypass",
        rulesRun: 40,
        skippedCategories: [],
      },
      warning: "Structural fallback",
    });

    const internals = strategy as unknown as {
      fetchHtml: ReturnType<typeof vi.fn>;
      scanStructural: ReturnType<typeof vi.fn>;
    };

    internals.fetchHtml = vi.fn().mockResolvedValue({
      content: "<html><title>Fallback</title></html>",
      pageTitle: "Fallback",
      screenshotBase64: null,
      mobileScreenshotBase64: null,
    });
    internals.scanStructural = vi.fn().mockResolvedValue(structuralResult);

    const connectSpy = vi.spyOn(chromium, "connectOverCDP");

    const result = await strategy.scan(
      "https://www.shutterstock.com",
      makeOpts({
        viewport: "desktop",
        engineProfile: "comprehensive",
      }),
    );

    expect(result).toBe(structuralResult);
    expect(connectSpy).not.toHaveBeenCalled();
    expect(internals.scanStructural).toHaveBeenCalledWith(
      "https://www.shutterstock.com",
      expect.objectContaining({
        viewport: "desktop",
        engineProfile: "comprehensive",
      }),
      expect.objectContaining({
        content: "<html><title>Fallback</title></html>",
      }),
      expect.stringContaining("did not return a live reconnect session"),
    );
  });
});
