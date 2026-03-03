"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import OpenAI from "openai";
import { groupViolations } from "./lib/groupViolations";
import { buildAgentPlanPrompt } from "./lib/buildAgentPlanPrompt";

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

export const CMS_PLATFORMS = new Set([
  "wordpress", "squarespace", "shopify", "wix", "webflow",
  "drupal", "joomla", "ghost", "hubspot", "weebly",
]);

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set.");
  }
  return new OpenAI({ apiKey });
}

// ═══════════════════════════════════════════════════════════════════════════
// Injectable dependencies for testability
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentPlanDeps {
  runQuery: (queryRef: unknown, args: unknown) => Promise<unknown>;
  runMutation: (mutationRef: unknown, args: unknown) => Promise<unknown>;
  storageStore: (blob: Blob) => Promise<unknown>;
  openaiCreate: (params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature: number;
    max_tokens: number;
  }) => Promise<{ choices: Array<{ message: { content: string | null } }> }>;
}

type AgentPlanResult = { success: true } | { success: false; error: string };

// ═══════════════════════════════════════════════════════════════════════════
// Core logic (exported for testing)
// ═══════════════════════════════════════════════════════════════════════════

export async function generateAgentPlanCore(
  deps: AgentPlanDeps,
  args: { auditId: string },
): Promise<AgentPlanResult> {
  try {
    const audit = (await deps.runQuery(api.audits.getAudit, {
      auditId: args.auditId,
    })) as Record<string, unknown> | null;

    if (!audit) {
      return { success: false, error: "Audit not found." };
    }

    const platform = audit.platform as string | undefined;
    if (!platform || CMS_PLATFORMS.has(platform)) {
      return {
        success: false,
        error: "Agent plans are only available for developer framework sites.",
      };
    }

    const rawViolations = audit.rawViolations as string | undefined;
    if (!rawViolations) {
      return { success: false, error: "No violation data available." };
    }

    const desktopViolations = JSON.parse(rawViolations);
    const mobileRaw = audit.mobileRawViolations as string | undefined;
    const mobileViolations = mobileRaw ? JSON.parse(mobileRaw) : undefined;

    const grouped = groupViolations(desktopViolations, mobileViolations);

    if (grouped.length === 0) {
      return { success: false, error: "No violations to generate a plan for." };
    }

    const { systemPrompt, userPrompt } = buildAgentPlanPrompt({
      violations: grouped,
      platform,
      url: audit.url as string,
      auditDate: new Date(audit.scannedAt as number).toISOString().split("T")[0],
      pageTitle: audit.pageTitle as string | undefined,
    });

    const completion = await deps.openaiCreate({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    });

    const agentPlanMd = completion.choices[0]?.message?.content;
    if (!agentPlanMd) {
      return { success: false, error: "No content returned from AI model." };
    }

    const agentPlanBlob = new Blob([agentPlanMd], { type: "text/markdown" });
    const storageId = await deps.storageStore(agentPlanBlob);

    await deps.runMutation(api.audits.updateAuditAgentPlan, {
      auditId: args.auditId,
      agentPlanFileId: storageId,
      agentPlanGeneratedAt: Date.now(),
    });

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Agent plan generation error:", error);
    return { success: false, error: message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Convex action (thin wrapper around core logic)
// ═══════════════════════════════════════════════════════════════════════════

export const generateAgentPlan = action({
  args: { auditId: v.id("audits") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { success: false, error: "You must be signed in to generate a fix plan." } as AgentPlanResult;
    }

    const audit = (await ctx.runQuery(api.audits.getAudit, {
      auditId: args.auditId,
    })) as Record<string, unknown> | null;

    if (!audit || audit.userId !== identity.subject) {
      return { success: false, error: "You can only generate fix plans for your own audits." } as AgentPlanResult;
    }

    const openai = getOpenAIClient();

    return generateAgentPlanCore(
      {
        runQuery: ctx.runQuery as AgentPlanDeps["runQuery"],
        runMutation: ctx.runMutation as AgentPlanDeps["runMutation"],
        storageStore: (blob: Blob) => ctx.storage.store(blob),
        openaiCreate: (params) =>
          openai.chat.completions.create(
            params as Parameters<typeof openai.chat.completions.create>[0],
          ) as Promise<{ choices: Array<{ message: { content: string | null } }> }>,
      },
      { auditId: args.auditId },
    );
  },
});
