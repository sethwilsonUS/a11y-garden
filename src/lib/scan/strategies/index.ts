/**
 * Scan strategy factory.
 *
 * Reads the SCAN_STRATEGY env var to determine which strategy to use.
 *
 * When SCAN_STRATEGY is not set, auto-detects based on env vars:
 *   - BROWSERLESS_URL set (no token) → local (Docker Browserless)
 *   - BROWSERLESS_TOKEN set          → fallback (BaaS → BQL escalation)
 *   - Neither set                    → local (launches local Playwright)
 *
 * Explicit values:
 *   local    → PlaywrightLocalStrategy (Docker / local Playwright, dev only)
 *   baas     → PlaywrightBaaSStrategy  (cloud Browserless, no BQL fallback)
 *   bql      → BqlJsdomStrategy        (cloud BQL stealth + JSDOM, always)
 *   fallback → FallbackStrategy        (BaaS first, BQL on WAF detection)
 */

import type { ScanStrategy } from "./types";
import { PlaywrightLocalStrategy } from "./playwright-local";
import { PlaywrightBaaSStrategy } from "./playwright-baas";
import { BqlJsdomStrategy } from "./bql-jsdom";
import { FallbackStrategy } from "./fallback";

export type ScanStrategyName = "local" | "baas" | "bql" | "fallback";

function detectDefaultStrategy(): ScanStrategyName {
  if (process.env.BROWSERLESS_URL && !process.env.BROWSERLESS_TOKEN)
    return "local";
  if (process.env.BROWSERLESS_TOKEN) return "fallback";
  return "local";
}

export function createScanStrategy(
  overrideName?: ScanStrategyName,
): ScanStrategy {
  const name =
    overrideName ??
    (process.env.SCAN_STRATEGY as ScanStrategyName | undefined) ??
    detectDefaultStrategy();

  switch (name) {
    case "local":
      return new PlaywrightLocalStrategy();
    case "baas":
      return new PlaywrightBaaSStrategy();
    case "bql":
      return new BqlJsdomStrategy();
    case "fallback":
      return new FallbackStrategy();
    default:
      throw new Error(
        `Unknown SCAN_STRATEGY "${name}". Valid values: local, baas, bql, fallback`,
      );
  }
}

export type {
  ScanStrategy,
  ScanStrategyOptions,
  StrategyScanResult,
  ScanModeInfo,
  ScanMetadata,
  ScanStrategyLabel,
} from "./types";
