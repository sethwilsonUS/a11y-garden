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

      // Skip if AI summary was already reused from a previous identical audit
      if (audit.aiSummary) {
        return;
      }

      const violations = JSON.parse(audit.rawViolations);
      const mobileViolations = audit.mobileRawViolations
        ? JSON.parse(audit.mobileRawViolations)
        : [];

      const POSITIVE_SUMMARY =
        "Excellent! This page passed all automated accessibility checks. While automated testing can't catch every accessibility issue, this is a great foundation. Consider manual testing with assistive technologies for comprehensive coverage.";

      // Both viewports have zero violations — one shared positive summary, no OpenAI call needed
      if (violations.length === 0 && mobileViolations.length === 0) {
        await ctx.runMutation(api.audits.updateAuditAIOnly, {
          auditId: args.auditId,
          aiSummary: POSITIVE_SUMMARY,
          topIssues: [],
        });
        return;
      }

      // Create prompt for OpenAI — kept in sync with src/lib/ai-summary.ts
      const systemPrompt = `You are an accessibility expert translating technical WCAG violations into plain English for web developers and site owners. Focus on user impact and actionable fixes. Be concise and helpful.`;

      // Platform-specific context for more actionable advice
      const PLATFORM_LABELS: Record<string, string> = {
        wordpress: "WordPress", squarespace: "Squarespace", shopify: "Shopify",
        wix: "Wix", webflow: "Webflow", drupal: "Drupal", joomla: "Joomla",
        ghost: "Ghost", hubspot: "HubSpot", weebly: "Weebly",
        nextjs: "Next.js", nuxt: "Nuxt", gatsby: "Gatsby", angular: "Angular",
        remix: "Remix", astro: "Astro", react: "React", vue: "Vue", svelte: "Svelte",
      };
      const MEDIUM_CONFIDENCE_PLATFORMS = new Set(["react", "vue", "svelte"]);

      function buildUserPrompt(
        violationsSlice: unknown[],
        pName: string | null,
        isMediumConfidence: boolean,
        viewport: "desktop" | "mobile" = "desktop",
      ): string {
        const confidenceHedge = isMediumConfidence
          ? ` (Note: the site appears to use ${pName} based on HTML markers, but we're not 100% certain — frame your advice accordingly.)`
          : "";
        const platformInstruction = pName
          ? `\n3. A "platformTip" — a concise paragraph (2-4 sentences) with actionable, ${pName}-specific guidance for fixing the violations above. Reference specific ${pName} features, settings, plugins, or tools the site owner can use. Do NOT repeat the general summary — focus only on platform-specific how-to-fix advice.${confidenceHedge}`
          : "";
        const platformJsonField = pName
          ? `\n  "platformTip": "Specific ${pName} advice..."`
          : "";

        const viewportContext = viewport === "mobile"
          ? `\nThese violations were found at a mobile viewport (390×844, iPhone). Focus your summary and recommendations on mobile-specific impact — touch target sizes, tap spacing, text readability at small screens, viewport zoom restrictions, and responsive layout issues. Mention when violations would primarily affect mobile users.`
          : `\nThese violations were found at a desktop viewport (1920×1080). Focus your summary and recommendations on desktop-specific impact — keyboard navigation, screen reader compatibility, focus indicators, and hover interactions.`;

        return `
Analyze these accessibility violations and provide:
1. A 2-3 sentence summary of the overall accessibility state
2. The most important issues to address, as a JSON array called "topIssues". Each entry should be a brief, one-line description with user impact. Include between 1 and 5 issues — use your judgment based on the number and diversity of violations. If there is only one distinct problem, return just one issue. If there are many different problems, return up to 5. Never repeat the same issue in different words.${platformInstruction}
${viewportContext}

Violations:
${JSON.stringify(violationsSlice, null, 2)}

Format your response as JSON:
{
  "summary": "...",
  "topIssues": ["issue 1", "...up to 5"]${platformJsonField}
}
`;
      }

      async function analyzeViewport(
        openaiClient: OpenAI,
        violationsJson: unknown[],
        pName: string | null,
        isMediumConf: boolean,
        viewport: "desktop" | "mobile" = "desktop",
      ): Promise<{ summary: string; topIssues: string[]; platformTip?: string }> {
        const prompt = buildUserPrompt(violationsJson, pName, isMediumConf, viewport);
        const completion = await openaiClient.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        });
        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No response from OpenAI");
        const resp = JSON.parse(content);
        const topIssues: string[] = Array.isArray(resp.topIssues)
          ? resp.topIssues.slice(0, 5)
          : [];
        const platformTip =
          typeof resp.platformTip === "string" && resp.platformTip.trim()
            ? resp.platformTip.trim()
            : undefined;
        return {
          summary: resp.summary || "Analysis complete.",
          topIssues,
          ...(platformTip ? { platformTip } : {}),
        };
      }

      const platform = audit.platform;
      const platformName = platform ? (PLATFORM_LABELS[platform] ?? platform) : null;
      const isMediumConfidence = platform ? MEDIUM_CONFIDENCE_PLATFORMS.has(platform) : false;

      // Run desktop and mobile AI analysis in parallel.
      // Skip the OpenAI call for any viewport with zero violations — the results
      // page shows the shared positive summary for those.
      const hasMobileData = audit.mobileRawViolations !== undefined;

      const [desktopResult, mobileResult] = await Promise.all([
        violations.length > 0
          ? analyzeViewport(openai, violations.slice(0, 10), platformName, isMediumConfidence, "desktop")
          : Promise.resolve({ summary: POSITIVE_SUMMARY, topIssues: [] as string[] }),
        hasMobileData && mobileViolations.length > 0
          ? analyzeViewport(openai, mobileViolations.slice(0, 10), null, false, "mobile")
          : Promise.resolve(undefined),
      ]);

      // Update audit with AI results (status is already complete)
      await ctx.runMutation(api.audits.updateAuditAIOnly, {
        auditId: args.auditId,
        aiSummary: desktopResult.summary,
        topIssues: desktopResult.topIssues,
        ...(desktopResult && "platformTip" in desktopResult && typeof desktopResult.platformTip === "string"
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
