import { query } from "./_generated/server";

export const getScanStats = query({
  args: {},
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const recentAudits = await ctx.db
      .query("audits")
      .withIndex("by_scannedAt")
      .filter((q) => q.gt(q.field("scannedAt"), thirtyDaysAgo))
      .collect();

    const completed = recentAudits.filter((a) => a.status === "complete");

    const bqlScans = completed.filter(
      (a) =>
        a.scanStrategy === "bql-stealth" || a.scanStrategy === "bql-proxy",
    );
    const baasScans = completed.filter((a) => a.scanStrategy === "baas");
    const wafDetected = completed.filter((a) => a.wafDetected === true);
    const wafBypassed = completed.filter((a) => a.wafBypassed === true);

    const avgDuration =
      completed.length > 0
        ? Math.round(
            completed.reduce((sum, a) => sum + (a.scanDurationMs ?? 0), 0) /
              completed.length,
          )
        : 0;

    const wafTypeBreakdown: Record<string, number> = {};
    for (const a of wafDetected) {
      const type = a.wafType ?? "unknown";
      wafTypeBreakdown[type] = (wafTypeBreakdown[type] ?? 0) + 1;
    }

    return {
      period: "last_30_days",
      totalScans: completed.length,
      baasScans: baasScans.length,
      bqlScans: bqlScans.length,
      noStrategyRecorded: completed.length - baasScans.length - bqlScans.length,
      wafDetected: wafDetected.length,
      wafBypassed: wafBypassed.length,
      wafBypassRate:
        wafDetected.length > 0
          ? Math.round((wafBypassed.length / wafDetected.length) * 100)
          : 0,
      avgScanDurationMs: avgDuration,
      wafTypeBreakdown,
    };
  },
});
