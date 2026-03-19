"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { DEFAULT_AI_MODEL, generateAISummary } from "../src/lib/ai-summary";

export const analyzeViolations = action({
  args: { auditId: v.id("audits") },
  handler: async (ctx, args) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error(
          "OPENAI_API_KEY environment variable is not set. Please add it in the Convex dashboard.",
        );
      }

      const audit = await ctx.runQuery(api.audits.getAudit, {
        auditId: args.auditId,
      });

      if (!audit || (!audit.rawFindings && !audit.rawViolations)) {
        throw new Error("Audit or findings not found");
      }

      // Skip if AI summary was already reused from a previous identical audit
      if (audit.aiSummary) {
        return;
      }

      const hasMobileData =
        audit.mobileRawFindings !== undefined ||
        audit.mobileRawViolations !== undefined ||
        audit.mobileViolations !== undefined;

      const [desktopResult, mobileResult] = await Promise.all([
        generateAISummary(
          audit.rawFindings ?? "[]",
          DEFAULT_AI_MODEL,
          audit.platform,
          "desktop",
          audit.rawViolations,
        ),
        hasMobileData
          ? generateAISummary(
              audit.mobileRawFindings ?? "[]",
              DEFAULT_AI_MODEL,
              undefined,
              "mobile",
              audit.mobileRawViolations,
            )
          : Promise.resolve(undefined),
      ]);

      await ctx.runMutation(api.audits.updateAuditAIOnly, {
        auditId: args.auditId,
        aiSummary: desktopResult.summary,
        topIssues: desktopResult.topIssues,
        ...(desktopResult.platformTip
          ? { platformTip: desktopResult.platformTip }
          : {}),
        ...(mobileResult ? { mobileAiSummary: mobileResult.summary } : {}),
        ...(mobileResult ? { mobileTopIssues: mobileResult.topIssues } : {}),
      });
    } catch (error: unknown) {
      console.error("AI analysis error:", error);
      // Status is already complete, so just log the error
      // The results page will simply not show AI content
    }
  },
});
