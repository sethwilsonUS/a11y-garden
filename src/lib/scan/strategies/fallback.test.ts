import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ScanBlockedError } from "@/lib/scanner";
import type { ScanStrategyOptions, StrategyScanResult } from "./types";

function makeOpts(
  overrides: Partial<ScanStrategyOptions> = {},
): ScanStrategyOptions {
  return {
    viewport: "desktop",
    captureScreenshot: false,
    timeBudgetMs: 55_000,
    isAuthenticated: true,
    ...overrides,
  };
}

function makeResult(
  overrides: Partial<StrategyScanResult> = {},
): StrategyScanResult {
  return {
    violations: { critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 },
    rawViolations: "[]",
    truncated: false,
    scanMode: { mode: "full", rulesRun: 80, skippedCategories: [] },
    ...overrides,
  };
}

let baasBehavior: "succeed" | "waf-blocked" | "timeout" = "succeed";
let bqlBehavior: "succeed" | "fail" = "succeed";

vi.mock("./playwright-baas", () => ({
  PlaywrightBaaSStrategy: class MockBaas {
    name = "mock-baas";
    async scan() {
      if (baasBehavior === "succeed") return makeResult();
      if (baasBehavior === "waf-blocked") {
        throw new ScanBlockedError("WAF", "Blocked Page", 403);
      }
      throw new Error("BaaS attempt timed out");
    }
  },
}));

vi.mock("./bql-jsdom", () => ({
  BqlJsdomStrategy: class MockBql {
    name = "mock-bql";
    async scan() {
      if (bqlBehavior === "fail") {
        throw new ScanBlockedError("BQL failed too", "Blocked", 403);
      }
      return makeResult({
        scanMode: {
          mode: "jsdom-structural",
          reason: "WAF bypass",
          rulesRun: 40,
          skippedCategories: [],
        },
      });
    }
  },
}));

describe("FallbackStrategy", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    baasBehavior = "succeed";
    bqlBehavior = "succeed";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function createStrategy() {
    const { FallbackStrategy } = await import("./fallback");
    return new FallbackStrategy();
  }

  it("returns BaaS result when no WAF is detected", async () => {
    baasBehavior = "succeed";
    const strategy = await createStrategy();
    const result = await strategy.scan("https://example.com", makeOpts());
    expect(result.metadata?.scanStrategy).toBe("baas");
    expect(result.metadata?.wafDetected).toBe(false);
    expect(result.metadata?.wafBypassed).toBe(false);
    expect(result.scanMode.mode).toBe("full");
  });

  it("escalates to BQL when WAF blocks BaaS and user is authenticated", async () => {
    baasBehavior = "waf-blocked";
    bqlBehavior = "succeed";
    const strategy = await createStrategy();
    const result = await strategy.scan(
      "https://waf-site.com",
      makeOpts({ isAuthenticated: true }),
    );
    expect(result.metadata?.wafDetected).toBe(true);
    expect(result.metadata?.wafBypassed).toBe(true);
    expect(result.scanMode.mode).toBe("jsdom-structural");
  });

  it("throws requiresAuth error when WAF blocks and user is anonymous", async () => {
    baasBehavior = "waf-blocked";
    const strategy = await createStrategy();

    await expect(
      strategy.scan(
        "https://waf-site.com",
        makeOpts({ isAuthenticated: false }),
      ),
    ).rejects.toThrow(ScanBlockedError);

    try {
      await strategy.scan(
        "https://waf-site.com",
        makeOpts({ isAuthenticated: false }),
      );
    } catch (err) {
      expect(err).toBeInstanceOf(ScanBlockedError);
      expect((err as ScanBlockedError).requiresAuth).toBe(true);
    }
  });

  it("escalates to BQL on BaaS timeout", async () => {
    baasBehavior = "timeout";
    bqlBehavior = "succeed";
    const strategy = await createStrategy();
    const result = await strategy.scan(
      "https://slow-site.com",
      makeOpts({ isAuthenticated: true }),
    );
    expect(result.metadata?.wafBypassed).toBe(true);
    expect(result.scanMode.mode).toBe("jsdom-structural");
  });

  it("aborts BQL when time budget is too low", async () => {
    baasBehavior = "waf-blocked";
    const strategy = await createStrategy();

    await expect(
      strategy.scan(
        "https://waf-site.com",
        makeOpts({ isAuthenticated: true, timeBudgetMs: 5_000 }),
      ),
    ).rejects.toThrow(/insufficient time/i);
  });

  it("populates scanDurationMs in metadata", async () => {
    baasBehavior = "succeed";
    const strategy = await createStrategy();
    const result = await strategy.scan("https://example.com", makeOpts());
    expect(result.metadata?.scanDurationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.metadata?.scanDurationMs).toBe("number");
  });
});
