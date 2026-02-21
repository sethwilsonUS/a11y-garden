"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import OpenAI from "openai";

// Lazy initialization to avoid errors when API key isn't set yet
function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set. Please add it in the Convex dashboard.");
  }
  return new OpenAI({ apiKey });
}

export const analyzeViolations = action({
  args: { auditId: v.id("audits") },
  handler: async (ctx, args) => {
    try {
      const openai = getOpenAIClient();
      
      // Get audit
      const audit = await ctx.runQuery(api.audits.getAudit, {
        auditId: args.auditId,
      });

      if (!audit || !audit.rawViolations) {
        throw new Error("Audit or violations not found");
      }

      const violations = JSON.parse(audit.rawViolations);

      // If no violations, create a positive summary
      if (violations.length === 0) {
        await ctx.runMutation(api.audits.updateAuditAIOnly, {
          auditId: args.auditId,
          aiSummary:
            "Excellent! This page passed all automated accessibility checks. While automated testing can't catch every accessibility issue, this is a great foundation. Consider manual testing with assistive technologies for comprehensive coverage.",
          topIssues: [],
        });
        return;
      }

      // Create prompt for OpenAI — kept in sync with src/lib/ai-summary.ts
      const systemPrompt = `You are an accessibility expert translating technical WCAG violations into plain English for web developers and site owners. Focus on user impact and actionable fixes. Be concise and helpful.`;

      const userPrompt = `
Analyze these accessibility violations and provide:
1. A 2-3 sentence summary of the overall accessibility state
2. The most important issues to address, as a JSON array called "topIssues". Each entry should be a brief, one-line description with user impact. Include between 1 and 5 issues — use your judgment based on the number and diversity of violations. If there is only one distinct problem, return just one issue. If there are many different problems, return up to 5. Never repeat the same issue in different words.

Violations:
${JSON.stringify(violations.slice(0, 10), null, 2)}

Format your response as JSON:
{
  "summary": "...",
  "topIssues": ["issue 1", "...up to 5"]
}
`;

      // Call OpenAI
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });

      const content = completion.choices[0].message.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      const response = JSON.parse(content);

      // Safety cap: ensure topIssues is between 0-5 items
      const topIssues: string[] = Array.isArray(response.topIssues)
        ? response.topIssues.slice(0, 5)
        : [];

      // Update audit with AI results (status is already complete)
      await ctx.runMutation(api.audits.updateAuditAIOnly, {
        auditId: args.auditId,
        aiSummary: response.summary || "Analysis complete.",
        topIssues,
      });
    } catch (error: unknown) {
      console.error("AI analysis error:", error);
      // Status is already complete, so just log the error
      // The results page will simply not show AI content
    }
  },
});
