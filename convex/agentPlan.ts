"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import OpenAI from "openai";
import { DEFAULT_MAX_GROUPS, groupViolations } from "./lib/groupViolations";
import { buildAgentPlanPrompt } from "./lib/buildAgentPlanPrompt";
import {
  parseSerializedFindings,
  type EngineProfile,
  type EngineSummary,
} from "../src/lib/findings";

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

export const CMS_PLATFORMS = new Set([
  "wordpress", "squarespace", "shopify", "wix", "webflow",
  "drupal", "joomla", "ghost", "hubspot", "weebly",
]);
const AGENT_PLAN_MODEL = "gpt-5.4-mini";

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
    max_completion_tokens: number;
  }) => Promise<{ choices: Array<{ message: { content: string | null } }> }>;
}

type AgentPlanResult = { success: true } | { success: false; error: string };

const ENGINE_LABELS: Record<string, string> = {
  axe: "axe-core",
  ace: "IBM ACE",
  htmlcs: "HTML_CodeSniffer",
};

function parseEngineSummary(
  value: unknown,
): EngineSummary | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as EngineSummary;
    } catch {
      return undefined;
    }
  }
  if (typeof value === "object" && value !== null) {
    return value as EngineSummary;
  }
  return undefined;
}

function summarizeViewportCoverage(
  viewport: "desktop" | "mobile",
  summary: EngineSummary | undefined,
): string | null {
  if (!summary) return null;
  const nonCompleted = summary.engines.filter((engine) => engine.status !== "completed");
  if (nonCompleted.length === 0) return null;

  const label = viewport === "desktop" ? "Desktop" : "Mobile";
  const details = nonCompleted.map((engine) => {
    const engineLabel = ENGINE_LABELS[engine.engine] ?? engine.engine;
    return `${engineLabel} ${engine.status}${engine.note ? ` (${engine.note})` : ""}`;
  });

  return `${label} engine coverage was partial: ${details.join("; ")}.`;
}

function buildCoverageNotes(
  audit: Record<string, unknown>,
): string[] {
  const notes: string[] = [];
  const desktopCoverage = summarizeViewportCoverage(
    "desktop",
    parseEngineSummary(audit.engineSummary),
  );
  const mobileCoverage = summarizeViewportCoverage(
    "mobile",
    parseEngineSummary(audit.mobileEngineSummary),
  );

  if (desktopCoverage) notes.push(desktopCoverage);
  if (mobileCoverage) notes.push(mobileCoverage);
  if (audit.truncated) {
    notes.push(
      "Desktop stored examples were trimmed for size, so selectors and HTML snippets are representative rather than exhaustive.",
    );
  }
  if (audit.mobileTruncated) {
    notes.push(
      "Mobile stored examples were trimmed for size, so selectors and HTML snippets are representative rather than exhaustive.",
    );
  }

  return notes;
}

// ═══════════════════════════════════════════════════════════════════════════
// Core logic (exported for testing)
// ═══════════════════════════════════════════════════════════════════════════

export async function generateAgentPlanCore(
  deps: AgentPlanDeps,
  args: { auditId: string },
): Promise<AgentPlanResult> {
  try {
    const audit = (await deps.runQuery(internal.audits.getAuditInternal, {
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

    const desktopFindings = parseSerializedFindings(
      audit.rawFindings as string | undefined,
      audit.rawViolations as string | undefined,
    );
    const mobileFindings = parseSerializedFindings(
      audit.mobileRawFindings as string | undefined,
      audit.mobileRawViolations as string | undefined,
    );

    if (desktopFindings.length === 0 && mobileFindings.length === 0) {
      return { success: false, error: "No violation data available." };
    }

    const confirmedDesktopFindings = desktopFindings.filter(
      (finding) => finding.disposition === "confirmed",
    );
    const confirmedMobileFindings = mobileFindings.filter(
      (finding) => finding.disposition === "confirmed",
    );

    const allGrouped = groupViolations(
      confirmedDesktopFindings,
      confirmedMobileFindings.length > 0 ? confirmedMobileFindings : undefined,
      Number.MAX_SAFE_INTEGER,
    );
    const grouped = allGrouped.slice(0, DEFAULT_MAX_GROUPS);

    if (grouped.length === 0) {
      return {
        success: false,
        error:
          "Only manual-review findings are available. No confirmed violations to generate a plan for.",
      };
    }

    const totalConfirmedFindings =
      confirmedDesktopFindings.length + confirmedMobileFindings.length;

    const { systemPrompt, userPrompt } = buildAgentPlanPrompt({
      violations: grouped,
      platform,
      url: audit.url as string,
      auditDate: new Date(audit.scannedAt as number).toISOString().split("T")[0],
      pageTitle: audit.pageTitle as string | undefined,
      scanProfile: audit.engineProfile as EngineProfile | undefined,
      totalConfirmedFindings,
      totalGroupedIssues: allGrouped.length,
      coverageNotes: buildCoverageNotes(audit),
    });

    const completion = await deps.openaiCreate({
      model: AGENT_PLAN_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_completion_tokens: 4096,
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

    const audit = (await ctx.runQuery(internal.audits.getAuditInternal, {
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
