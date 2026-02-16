import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  audits: defineTable({
    url: v.string(),
    domain: v.string(),
    pageTitle: v.optional(v.string()),
    scannedAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("scanning"),
      v.literal("analyzing"),
      v.literal("complete"),
      v.literal("error")
    ),

    // Violation counts
    violations: v.object({
      critical: v.number(),
      serious: v.number(),
      moderate: v.number(),
      minor: v.number(),
      total: v.number(),
    }),

    // Grading
    letterGrade: v.union(
      v.literal("A"),
      v.literal("B"),
      v.literal("C"),
      v.literal("D"),
      v.literal("F")
    ),
    score: v.number(),
    gradingVersion: v.optional(v.number()), // Tracks algorithm version for lazy recalc

    // Scan mode indicator
    // "full" = all axe-core rules ran successfully
    // "safe" = fell back to curated safe rules due to site complexity (see safeRules in route.ts)
    scanMode: v.optional(
      v.union(v.literal("full"), v.literal("safe"))
    ),

    // Set when the raw violations payload was trimmed to fit the 500 KB cap
    truncated: v.optional(v.boolean()),

    // AI-generated content
    aiSummary: v.optional(v.string()),
    topIssues: v.optional(v.array(v.string())),

    // Raw data
    rawViolations: v.optional(v.string()),

    // User association
    userId: v.optional(v.string()),
    isPublic: v.boolean(),

    // Error handling
    errorMessage: v.optional(v.string()),
  })
    .index("by_url", ["url"])
    .index("by_domain", ["domain"])
    .index("by_user", ["userId"])
    .index("by_scannedAt", ["scannedAt"])
    .index("by_public", ["isPublic"])
    .searchIndex("search_domain", {
      searchField: "domain",
      filterFields: ["isPublic"],
    }),

  userSettings: defineTable({
    userId: v.string(),
    savedAudits: v.array(v.id("audits")),
    emailNotifications: v.boolean(),
  }).index("by_userId", ["userId"]),
});
