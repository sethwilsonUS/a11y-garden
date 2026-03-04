/**
 * Playwright local strategy.
 *
 * Connects to a local Docker Browserless instance (via BROWSERLESS_URL)
 * or launches a local Playwright Chromium instance.
 * Used for local development with `npm run dev:browserless`.
 */

import { scanUrl } from "@/lib/scanner";
import type {
  ScanStrategy,
  ScanStrategyOptions,
  StrategyScanResult,
} from "./types";

export class PlaywrightLocalStrategy implements ScanStrategy {
  name = "playwright-local";

  private browserWSEndpoint: string | undefined;

  constructor() {
    const url = process.env.BROWSERLESS_URL;
    const token = process.env.BROWSERLESS_TOKEN;
    if (url) {
      this.browserWSEndpoint = token ? `${url}?token=${token}` : url;
    }
    // If no BROWSERLESS_URL, scanUrl will launch local Playwright
  }

  async scan(
    url: string,
    opts: ScanStrategyOptions,
  ): Promise<StrategyScanResult> {
    const result = await scanUrl(url, {
      browserWSEndpoint: this.browserWSEndpoint,
      captureScreenshot: opts.captureScreenshot,
      viewport: opts.viewport,
    });

    return {
      violations: result.violations,
      rawViolations: result.rawViolations,
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
