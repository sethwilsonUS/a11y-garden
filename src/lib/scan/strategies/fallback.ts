/**
 * Fallback strategy: BaaS → BQL escalation with time-budget management.
 *
 * 1. Try BaaS (Playwright cloud) — fast, full accuracy, 15s budget
 * 2. If WAF detected and user is authenticated, fall back to BQL
 * 3. If WAF detected and user is anonymous, return requiresAuth error
 *
 * The BQL path uses single viewport only — JSDOM has no renderer so
 * desktop/mobile is meaningless. The route layer clones the result for both.
 */

import { ScanBlockedError } from "@/lib/scanner";
import type { PlaywrightBaaSStrategy } from "./playwright-baas";
import type { BqlJsdomStrategy } from "./bql-jsdom";
import { usageTracker } from "../monitoring/usage-tracker";
import { scanLog } from "../monitoring/scan-logger";
import type {
  ScanStrategy,
  ScanStrategyOptions,
  StrategyScanResult,
  ScanMetadata,
} from "./types";

const BAAS_TIMEOUT_MS = 30_000;
const MIN_REMAINING_FOR_BQL_MS = 30_000;
const RESPONSE_BUFFER_MS = 10_000;

export class FallbackStrategy implements ScanStrategy {
  name = "fallback";

  private baas: PlaywrightBaaSStrategy | null = null;
  private bql: BqlJsdomStrategy | null = null;
  private wafBlockedUrls = new Set<string>();
  private baasDisabled = false;

  private async getBaas(): Promise<PlaywrightBaaSStrategy> {
    if (!this.baas) {
      const { PlaywrightBaaSStrategy } = await import("./playwright-baas");
      this.baas = new PlaywrightBaaSStrategy();
    }
    return this.baas;
  }

  private async getBql(): Promise<BqlJsdomStrategy> {
    if (!this.bql) {
      const { BqlJsdomStrategy } = await import("./bql-jsdom");
      this.bql = new BqlJsdomStrategy();
    }
    return this.bql;
  }

  async scan(
    url: string,
    opts: ScanStrategyOptions,
  ): Promise<StrategyScanResult> {
    const startTime = Date.now();
    const deadline = startTime + opts.timeBudgetMs;
    const skipBaas = this.baasDisabled || this.wafBlockedUrls.has(url);

    // Step 1: Try BaaS (fast, full accuracy) — skip if BaaS is broken or URL is WAF-blocked
    if (!skipBaas) {
      try {
        const baas = await this.getBaas();
        const baasTimeout = Math.min(BAAS_TIMEOUT_MS, opts.timeBudgetMs);
        const result = await Promise.race([
          baas.scan(url, {
            ...opts,
            timeBudgetMs: baasTimeout,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("BaaS attempt timed out")),
              baasTimeout,
            ),
          ),
        ]);

        usageTracker.record("baas");
        result.metadata = {
          scanStrategy: "baas",
          wafDetected: false,
          wafType: null,
          wafBypassed: false,
          scanDurationMs: Date.now() - startTime,
        };
        return result;
      } catch (err) {
        const isScanBlocked = err instanceof ScanBlockedError;
        const msg = err instanceof Error ? err.message : String(err);

        // Browserless API errors (quota, auth) are infrastructure issues,
        // not WAF blocks. Don't escalate to BQL — it uses the same token.
        const isBrowserlessApiError =
          msg.includes("401 Unauthorized") ||
          msg.includes("units usage limit") ||
          msg.includes("403 Forbidden") ||
          msg.includes("authentication failed");

        if (isBrowserlessApiError) {
          throw new Error(
            "Scanner service temporarily unavailable — cloud browser quota exceeded. " +
            "Please try again later or contact support.",
          );
        }

        if (isScanBlocked) {
          this.wafBlockedUrls.add(url);
        } else {
          this.baasDisabled = true;
        }

        scanLog.bqlEscalation(
          url,
          "baas_failed",
          isScanBlocked ? "WAF blocked" : msg,
        );
      }
    } else if (this.baasDisabled && !this.wafBlockedUrls.has(url)) {
      scanLog.bqlEscalation(url, "baas_skipped", "BaaS disabled due to connection error");
    } else {
      scanLog.bqlEscalation(url, "baas_skipped", "URL already known WAF-blocked");
    }

    // Step 2: Auth gate — BQL burns cloud units, require sign-in.
    // Distinguish actual WAF blocks from generic BaaS failures so anonymous
    // users aren't told a site has a firewall when it doesn't.
    if (!opts.isAuthenticated) {
      const isActualWaf = this.wafBlockedUrls.has(url);
      throw new ScanBlockedError(
        isActualWaf
          ? "This site's firewall blocked our scanner. Sign in to unlock firewall bypass."
          : "This site couldn't be scanned from our cloud service. Sign in to try an alternative scanning method.",
        "",
        403,
        true,
      );
    }

    // Step 3: Circuit breaker — skip BQL if budget is nearly exhausted
    const budget = usageTracker.getBudgetStatus();
    if (budget.shouldDisableBql) {
      scanLog.budgetWarning(budget.monthly, budget.budget, budget.percentUsed);
      throw new ScanBlockedError(
        "This site's firewall blocked our scanner. Bypass capacity has been reached for this period.",
        "",
        403,
      );
    }

    // Step 4: BQL escalation (time-budgeted, authenticated users only)
    const remaining = deadline - Date.now();
    if (remaining < MIN_REMAINING_FOR_BQL_MS) {
      throw new Error(
        "WAF detected but insufficient time remaining for bypass attempt",
      );
    }

    scanLog.bqlEscalation(
      url,
      "bql_start",
      `Escalating to BQL (${Math.round(remaining / 1000)}s remaining)`,
    );

    const bql = await this.getBql();
    const bqlResult = await bql.scan(url, {
      ...opts,
      timeBudgetMs: remaining - RESPONSE_BUFFER_MS,
    });

    usageTracker.record("bql-stealth");

    const metadata: ScanMetadata = {
      scanStrategy: bqlResult.metadata?.scanStrategy ?? "bql-stealth",
      wafDetected: true,
      wafType: bqlResult.metadata?.wafType ?? null,
      wafBypassed: true,
      scanDurationMs: Date.now() - startTime,
    };

    bqlResult.metadata = metadata;
    return bqlResult;
  }
}
