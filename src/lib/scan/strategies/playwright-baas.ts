/**
 * Playwright Browser-as-a-Service strategy.
 *
 * Connects to a cloud Browserless instance via WebSocket.
 * This is the current production path — full Playwright + in-browser axe-core.
 */

import { scanUrl } from "@/lib/scanner";
import type {
  ScanStrategy,
  ScanStrategyOptions,
  StrategyScanResult,
} from "./types";

export class PlaywrightBaaSStrategy implements ScanStrategy {
  name = "playwright-baas";

  private browserWSEndpoint: string;

  constructor() {
    const token = process.env.BROWSERLESS_TOKEN;
    if (!token) {
      throw new Error(
        "PlaywrightBaaSStrategy requires BROWSERLESS_TOKEN to be set",
      );
    }
    const baseUrl =
      process.env.BROWSERLESS_URL ||
      "wss://production-sfo.browserless.io";
    const sep = baseUrl.includes("?") ? "&" : "?";
    this.browserWSEndpoint = `${baseUrl}${sep}token=${token}`;
  }

  async scan(
    url: string,
    opts: ScanStrategyOptions,
  ): Promise<StrategyScanResult> {
    const result = await scanUrl(url, {
      browserWSEndpoint: this.browserWSEndpoint,
      captureScreenshot: opts.captureScreenshot,
      engineProfile: opts.engineProfile,
      viewport: opts.viewport,
    });

    return {
      violations: result.violations,
      reviewViolations: result.reviewViolations,
      rawFindings: result.rawFindings,
      findingsVersion: result.findingsVersion,
      engineProfile: result.engineProfile,
      engineSummary: result.engineSummary,
      truncated: result.truncated,
      scanMode: result.scanModeInfo ?? {
        mode: "full",
        rulesRun: 0,
        skippedCategories: [],
      },
      screenshot: result.screenshot,
      screenshotWarning: result.screenshotWarning,
      pageTitle: result.pageTitle,
      platform: result.platform,
      warning: result.warning,
    };
  }
}
