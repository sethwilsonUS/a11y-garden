import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const lookup = query({
  args: { domain: v.string() },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("domainStrategies")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .first();

    if (!entry) return null;
    if (Date.now() - entry.lastScanned > CACHE_EXPIRY_MS) return null;

    return entry;
  },
});

export const upsert = mutation({
  args: {
    domain: v.string(),
    strategy: v.union(v.literal("baas"), v.literal("bql")),
    wafType: v.optional(v.string()),
    adaptiveServing: v.optional(v.boolean()),
    adaptiveReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("domainStrategies")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .first();

    if (existing) {
      const scanCount = Math.round(1 / (1 - existing.successRate + 0.01));
      const newRate =
        args.strategy === "bql"
          ? (existing.successRate * scanCount + 1) / (scanCount + 1)
          : existing.successRate;

      await ctx.db.patch(existing._id, {
        strategy: args.strategy,
        wafType: args.wafType,
        lastScanned: Date.now(),
        successRate: newRate,
        ...(args.adaptiveServing !== undefined && {
          adaptiveServing: args.adaptiveServing,
          adaptiveReason: args.adaptiveReason,
        }),
      });
    } else {
      await ctx.db.insert("domainStrategies", {
        domain: args.domain,
        strategy: args.strategy,
        wafType: args.wafType,
        lastScanned: Date.now(),
        successRate: args.strategy === "bql" ? 1.0 : 0,
        adaptiveServing: args.adaptiveServing,
        adaptiveReason: args.adaptiveReason,
      });
    }
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("domainStrategies").collect();
    const active = all.filter(
      (e) => Date.now() - e.lastScanned <= CACHE_EXPIRY_MS,
    );

    return {
      totalDomains: active.length,
      bqlDomains: active.filter((e) => e.strategy === "bql").length,
      baasDomains: active.filter((e) => e.strategy === "baas").length,
      topWafDomains: active
        .filter((e) => e.strategy === "bql")
        .sort((a, b) => b.lastScanned - a.lastScanned)
        .slice(0, 20)
        .map((e) => ({
          domain: e.domain,
          wafType: e.wafType,
          successRate: e.successRate,
          lastScanned: e.lastScanned,
          adaptiveServing: e.adaptiveServing ?? false,
        })),
      adaptiveDomains: active.filter((e) => e.adaptiveServing === true).length,
    };
  },
});
