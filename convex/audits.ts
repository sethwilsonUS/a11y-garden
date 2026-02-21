import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { calculateGrade, GRADING_VERSION } from "./lib/grading";
import { Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/** Get the verified Clerk user ID from the auth token, or null if anonymous. */
async function getAuthUserId(
  ctx: MutationCtx | QueryCtx
): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

/**
 * Verify the caller is allowed to mutate an audit.
 *   – Owned audits: caller must be the owner.
 *   – Anonymous audits (no userId): allowed (public, short-lived scan flow).
 * Throws if the audit doesn't exist or the caller isn't authorized.
 */
async function verifyAuditOwnership(
  ctx: MutationCtx,
  auditId: Id<"audits">
) {
  const audit = await ctx.db.get(auditId);
  if (!audit) {
    throw new Error("Audit not found");
  }

  if (audit.userId) {
    const callerId = await getAuthUserId(ctx);
    if (callerId !== audit.userId) {
      throw new Error("Not authorized to modify this audit");
    }
  }

  return audit;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

// Create new audit job
export const createAudit = mutation({
  args: {
    url: v.string(),
    isPublic: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    // Normalize URL by stripping www. prefix
    const urlObj = new URL(args.url);
    if (urlObj.hostname.startsWith("www.")) {
      urlObj.hostname = urlObj.hostname.slice(4);
    }
    const normalizedUrl = urlObj.toString();

    // Extract domain from normalized URL
    const domain = urlObj.hostname;

    // Check if this user already scanned this URL recently (within 30 minutes)
    // to prevent accidental double-scans.  Only dedup against the caller's own
    // audits — returning someone else's audit would cause ownership errors when
    // the caller later tries to update it.  Anonymous users (no userId) skip
    // dedup entirely since we can't reliably identify repeat anonymous callers.
    if (userId) {
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
      const recentAudit = await ctx.db
        .query("audits")
        .withIndex("by_url", (q) => q.eq("url", normalizedUrl))
        .filter((q) =>
          q.and(
            q.eq(q.field("userId"), userId),
            q.gt(q.field("scannedAt"), thirtyMinutesAgo),
          ),
        )
        .first();

      if (recentAudit) {
        return recentAudit._id;
      }
    }

    // Create new audit
    const auditId = await ctx.db.insert("audits", {
      url: normalizedUrl,
      domain,
      scannedAt: Date.now(),
      status: "pending",
      violations: {
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0,
        total: 0,
      },
      letterGrade: "F",
      score: 0,
      userId: userId ?? undefined,
      isPublic: args.isPublic,
    });

    // Note: Scanner is now triggered client-side via Next.js API route
    // since Playwright can't run in Convex's serverless environment

    return auditId;
  },
});

// Get audit by ID
export const getAudit = query({
  args: { auditId: v.id("audits") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.auditId);
  },
});

// Get all public audits (paginated)
export const getPublicAudits = query({
  args: {
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    }),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("audits")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

// Get authenticated user's audits (userId derived from auth token)
export const getUserAudits = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Authentication required");
    }

    return await ctx.db
      .query("audits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

// Update audit status
export const updateAuditStatus = mutation({
  args: {
    auditId: v.id("audits"),
    status: v.union(
      v.literal("pending"),
      v.literal("scanning"),
      v.literal("analyzing"),
      v.literal("complete"),
      v.literal("error")
    ),
  },
  handler: async (ctx, args) => {
    await verifyAuditOwnership(ctx, args.auditId);
    await ctx.db.patch(args.auditId, { status: args.status });
  },
});

// Generate a short-lived upload URL for storing files (e.g. screenshots)
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Update audit with scan results
export const updateAuditWithResults = mutation({
  args: {
    auditId: v.id("audits"),
    violations: v.object({
      critical: v.number(),
      serious: v.number(),
      moderate: v.number(),
      minor: v.number(),
      total: v.number(),
    }),
    letterGrade: v.union(
      v.literal("A"),
      v.literal("B"),
      v.literal("C"),
      v.literal("D"),
      v.literal("F")
    ),
    score: v.number(),
    gradingVersion: v.optional(v.number()),
    rawViolations: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("scanning"),
      v.literal("analyzing"),
      v.literal("complete"),
      v.literal("error")
    ),
    // Scan mode: "full" = all rules, "safe" = fallback rules (color-contrast skipped)
    scanMode: v.optional(v.union(v.literal("full"), v.literal("safe"))),
    // Page title scraped from the site's <title> tag
    pageTitle: v.optional(v.string()),
    // True when raw violations were trimmed to fit the 500 KB size cap
    truncated: v.optional(v.boolean()),
    // Screenshot of the scanned page (Convex file storage ID)
    screenshotId: v.optional(v.id("_storage")),
    // Detected website platform/CMS (e.g. "wordpress", "squarespace")
    platform: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyAuditOwnership(ctx, args.auditId);
    const { auditId, ...updates } = args;
    await ctx.db.patch(auditId, {
      ...updates,
      // Clear any previous error message on successful update
      errorMessage: undefined,
    });
  },
});

// Update audit with error
export const updateAuditError = mutation({
  args: {
    auditId: v.id("audits"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyAuditOwnership(ctx, args.auditId);
    await ctx.db.patch(args.auditId, {
      status: "error",
      errorMessage: args.errorMessage,
    });
  },
});

// Update audit with AI results (legacy - sets status to complete)
export const updateAuditWithAI = mutation({
  args: {
    auditId: v.id("audits"),
    aiSummary: v.string(),
    topIssues: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyAuditOwnership(ctx, args.auditId);
    await ctx.db.patch(args.auditId, {
      aiSummary: args.aiSummary,
      topIssues: args.topIssues,
      status: "complete",
    });
  },
});

// Update audit with AI results only (doesn't change status)
// Used for progressive loading where results show immediately
export const updateAuditAIOnly = mutation({
  args: {
    auditId: v.id("audits"),
    aiSummary: v.string(),
    topIssues: v.array(v.string()),
    platformTip: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyAuditOwnership(ctx, args.auditId);
    await ctx.db.patch(args.auditId, {
      aiSummary: args.aiSummary,
      topIssues: args.topIssues,
      ...(args.platformTip ? { platformTip: args.platformTip } : {}),
    });
  },
});

// Get recent audits for homepage
export const getRecentAudits = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    return await ctx.db
      .query("audits")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .filter((q) => q.eq(q.field("status"), "complete"))
      .order("desc")
      .take(limit);
  },
});

// Get the screenshot URL for an audit (resolves storageId → serving URL)
export const getScreenshotUrl = query({
  args: { auditId: v.id("audits") },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (!audit?.screenshotId) return null;
    return await ctx.storage.getUrl(audit.screenshotId);
  },
});

// Search audits by domain (full-text search with prefix matching)
export const searchByDomain = query({
  args: { searchTerm: v.string() },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("audits")
      .withSearchIndex("search_domain", (q) =>
        q.search("domain", args.searchTerm).eq("isPublic", true)
      )
      .take(50);
    
    return results;
  },
});

// Recalculate grade for an audit (used for lazy recalculation on view)
// Any viewer can trigger this — it only writes deterministic grading data.
export const recalculateGrade = mutation({
  args: {
    auditId: v.id("audits"),
    letterGrade: v.union(
      v.literal("A"),
      v.literal("B"),
      v.literal("C"),
      v.literal("D"),
      v.literal("F")
    ),
    score: v.number(),
    gradingVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (!audit) {
      throw new Error("Audit not found");
    }
    await ctx.db.patch(args.auditId, {
      letterGrade: args.letterGrade,
      score: args.score,
      gradingVersion: args.gradingVersion,
    });
  },
});

// Get audit history for a specific page URL (all completed audits, newest first)
export const getAuditHistory = query({
  args: {
    url: v.string(),
    excludeAuditId: v.optional(v.id("audits")),
  },
  handler: async (ctx, args) => {
    const audits = await ctx.db
      .query("audits")
      .withIndex("by_url", (q) => q.eq("url", args.url))
      .filter((q) => q.eq(q.field("status"), "complete"))
      .order("desc")
      .take(20);

    // Exclude the current audit if specified
    if (args.excludeAuditId) {
      return audits.filter((a) => a._id !== args.excludeAuditId);
    }

    return audits;
  },
});

// ============================================
// MIGRATION: Batch recalculate all audit grades
// ============================================
// Run this once from the Convex dashboard to update all existing audits
// to use the current grading algorithm.
//
// To run: Go to Convex Dashboard → Functions → audits:migrateGrades → Run

export const migrateGrades = mutation({
  args: {},
  handler: async (ctx) => {
    // Get all audits that need updating (no gradingVersion or outdated)
    const allAudits = await ctx.db.query("audits").collect();
    
    let updated = 0;
    let skipped = 0;
    
    for (const audit of allAudits) {
      // Skip if already on current version
      if (audit.gradingVersion === GRADING_VERSION) {
        skipped++;
        continue;
      }
      
      // Skip if not complete (no violations to grade)
      if (audit.status !== "complete") {
        skipped++;
        continue;
      }
      
      // Recalculate grade using shared grading logic
      const { score, grade } = calculateGrade(audit.violations);
      
      await ctx.db.patch(audit._id, {
        letterGrade: grade,
        score: score,
        gradingVersion: GRADING_VERSION,
      });
      
      updated++;
    }
    
    return { updated, skipped, total: allAudits.length };
  },
});
