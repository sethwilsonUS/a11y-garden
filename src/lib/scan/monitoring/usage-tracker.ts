/**
 * Browserless usage tracker.
 *
 * Tracks daily/monthly BQL unit consumption in-memory (per process).
 * In serverless environments each instance tracks independently — this
 * gives a best-effort view rather than a global total. For true global
 * tracking, persist to Convex or Redis (Phase 4).
 *
 * Unit cost model (Browserless Free tier: 1,000 units/month):
 *   - Stealth-only BQL call  ≈ 1 unit
 *   - Proxy BQL call          ≈ 1 unit + ~6 units/MB transferred
 *   - BaaS (Playwright)       ≈ 1 unit per session
 */

export type StrategyType = "baas" | "bql-stealth" | "bql-proxy";

interface UsageEntry {
  strategy: StrategyType;
  estimatedUnits: number;
  timestamp: number;
}

const UNIT_COSTS: Record<StrategyType, number> = {
  baas: 1,
  "bql-stealth": 1,
  "bql-proxy": 5,
};

class UsageTracker {
  private entries: UsageEntry[] = [];
  private monthlyBudget: number;

  constructor() {
    this.monthlyBudget = parseInt(
      process.env.BROWSERLESS_MONTHLY_UNIT_BUDGET ?? "900",
      10,
    );
  }

  record(strategy: StrategyType, extraUnits = 0): void {
    const entry: UsageEntry = {
      strategy,
      estimatedUnits: UNIT_COSTS[strategy] + extraUnits,
      timestamp: Date.now(),
    };
    this.entries.push(entry);

    this.pruneOldEntries();

    const monthly = this.getMonthlyUsage();
    const pct = monthly / this.monthlyBudget;

    if (pct >= 0.95) {
      console.warn(
        `[UsageTracker] CRITICAL: ${monthly}/${this.monthlyBudget} units used (${Math.round(pct * 100)}%). BQL circuit breaker should activate.`,
      );
    } else if (pct >= 0.8) {
      console.warn(
        `[UsageTracker] WARNING: ${monthly}/${this.monthlyBudget} units used (${Math.round(pct * 100)}%).`,
      );
    }
  }

  getMonthlyUsage(): number {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const cutoff = startOfMonth.getTime();

    return this.entries
      .filter((e) => e.timestamp >= cutoff)
      .reduce((sum, e) => sum + e.estimatedUnits, 0);
  }

  getDailyUsage(): number {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const cutoff = startOfDay.getTime();

    return this.entries
      .filter((e) => e.timestamp >= cutoff)
      .reduce((sum, e) => sum + e.estimatedUnits, 0);
  }

  getBudgetStatus(): {
    monthly: number;
    budget: number;
    percentUsed: number;
    shouldDisableBql: boolean;
  } {
    const monthly = this.getMonthlyUsage();
    const pct = monthly / this.monthlyBudget;
    return {
      monthly,
      budget: this.monthlyBudget,
      percentUsed: Math.round(pct * 100),
      shouldDisableBql: pct >= 0.95,
    };
  }

  private pruneOldEntries(): void {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.entries = this.entries.filter((e) => e.timestamp >= thirtyDaysAgo);
  }
}

export const usageTracker = new UsageTracker();
