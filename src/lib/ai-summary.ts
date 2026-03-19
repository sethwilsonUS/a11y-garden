/**
 * AI-powered accessibility analysis
 *
 * Standalone OpenAI integration for the CLI and local demo mode.
 * The Convex action (convex/ai.ts) handles the same logic for the web app.
 */

import OpenAI from "openai";
import { PLATFORM_LABELS, getPlatformConfidence } from "./platforms";
import {
  getFindingNodeCount,
  parseSerializedFindings,
  splitFindingsByDisposition,
} from "./findings";

export interface AISummaryResult {
  summary: string;
  topIssues: string[];
  model: string;
  /** Platform-specific fix advice (only when platform is detected). */
  platformTip?: string;
}

/** Default model used by the CLI and production Convex action */
export const DEFAULT_AI_MODEL = "gpt-5.4-mini";
export const DEFAULT_AI_MODEL_LABEL = "GPT-5.4 Mini";
export const POSITIVE_AUTOMATION_SUMMARY =
  "Excellent! This page passed all automated accessibility checks. While automated testing can't catch every accessibility issue, this is a great foundation. Consider manual testing with assistive technologies for comprehensive coverage.";
export const REVIEW_ONLY_SUMMARY =
  "This scan did not produce any confirmed automated accessibility violations, but it did surface lower-confidence items that should be manually reviewed. Treat these as prompts for a closer human check rather than confirmed defects.";

export interface ModelOption {
  id: string;
  label: string;
  description: string;
  /** Price per 1M input tokens (USD). Source: platform.openai.com/docs/models */
  inputPrice: number;
  /** Price per 1M output tokens (USD). Source: platform.openai.com/docs/models */
  outputPrice: number;
}

/**
 * Models available for local experimentation.
 *
 * Ordered roughly by cost (cheapest → most expensive). The demo page
 * exposes these in a dropdown so developers can compare output quality
 * across different OpenAI models.
 *
 * Pricing sourced from developers.openai.com/api/docs/models (Mar 2026).
 */
export const AVAILABLE_MODELS: ModelOption[] = [
  { id: "gpt-4o-mini",  label: "GPT-4o Mini",   description: "Legacy budget baseline", inputPrice: 0.15,  outputPrice: 0.60  },
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano",  description: "Fastest GPT-5.4 option", inputPrice: 0.20,  outputPrice: 1.25  },
  { id: "gpt-5-mini",   label: "GPT-5 Mini",    description: "Low-cost reasoning",      inputPrice: 0.25,  outputPrice: 2.00  },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini",  description: "Default",                 inputPrice: 0.75,  outputPrice: 3.00  },
  { id: "gpt-5.4",      label: "GPT-5.4",       description: "Flagship",                inputPrice: 2.50,  outputPrice: 15.00 },
];

export function getModelLabel(modelId?: string | null): string {
  if (!modelId) {
    return DEFAULT_AI_MODEL_LABEL;
  }

  return AVAILABLE_MODELS.find((model) => model.id === modelId)?.label ?? modelId;
}

/**
 * Format a model's pricing for display (e.g. "$0.15 in / $0.60 out").
 * Prices are per 1M tokens.
 */
export function formatModelPrice(model: ModelOption): string {
  const fmt = (n: number) => n < 1 ? `$${n.toFixed(2)}` : `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
  return `${fmt(model.inputPrice)} in / ${fmt(model.outputPrice)} out`;
}

/**
 * Generate an AI summary and top issues list from normalized accessibility findings.
 *
 * Uses OpenAI with the same prompt as the Convex action.
 * Requires OPENAI_API_KEY to be set in the environment.
 *
 * @param rawFindings - JSON string of normalized findings
 * @param model - OpenAI model ID to use (defaults to gpt-5.4-mini)
 * @param platform - Optional detected platform slug (e.g. "wordpress")
 * @returns AI-generated summary, top issues, and which model was used
 */
export async function generateAISummary(
  rawFindings: string,
  model: string = DEFAULT_AI_MODEL,
  platform?: string,
  viewport: "desktop" | "mobile" = "desktop",
  rawViolations?: string,
): Promise<AISummaryResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY environment variable is not set. Use --no-ai to skip.",
    );
  }

  const openai = new OpenAI({ apiKey });
  const findings = parseSerializedFindings(rawFindings, rawViolations);
  const { confirmed, review } = splitFindingsByDisposition(findings);

  // If no violations, return a positive summary
  if (confirmed.length === 0 && review.length === 0) {
    return {
      summary: POSITIVE_AUTOMATION_SUMMARY,
      topIssues: [],
      model,
    };
  }

  if (confirmed.length === 0) {
    return {
      summary: REVIEW_ONLY_SUMMARY,
      topIssues: [],
      model,
    };
  }

  const aiInput = confirmed.slice(0, 10).map((finding) => ({
    id: finding.id,
    title: finding.help,
    impact: finding.impact,
    description: finding.description,
    engines: finding.engines,
    wcagCriteria: finding.wcagCriteria,
    wcagTags: finding.wcagTags,
    nodeCount: getFindingNodeCount(finding),
    selectors: finding.nodes.slice(0, 3).map((node) => node.selector),
  }));

  // Same prompts as convex/ai.ts — kept in sync manually
  const systemPrompt = `You are an accessibility expert translating technical accessibility findings into plain English for web developers and site owners. Focus on user impact and actionable fixes. Be concise and helpful.`;

  // Platform-specific context for more actionable advice
  const platformName = platform ? (PLATFORM_LABELS[platform] ?? platform) : null;
  const isMediumConfidence = platform ? getPlatformConfidence(platform) === "medium" : false;

  const confidenceHedge = isMediumConfidence
    ? ` (Note: the site appears to use ${platformName} based on HTML markers, but we're not 100% certain — frame your advice accordingly.)`
    : "";

  const platformInstruction = platformName
    ? `\n3. A "platformTip" — a concise paragraph (2-4 sentences) with actionable, ${platformName}-specific guidance for fixing the violations above. Reference specific ${platformName} features, settings, plugins, or tools the site owner can use. Do NOT repeat the general summary — focus only on platform-specific how-to-fix advice.${confidenceHedge}`
    : "";

  const platformJsonField = platformName
    ? `\n  "platformTip": "Specific ${platformName} advice..."`
    : "";

  const viewportContext = viewport === "mobile"
    ? `\nThese violations were found at a mobile viewport (390×844, iPhone). Focus your summary and recommendations on mobile-specific impact — touch target sizes, tap spacing, text readability at small screens, viewport zoom restrictions, and responsive layout issues. Mention when violations would primarily affect mobile users.`
    : `\nThese violations were found at a desktop viewport (1920×1080). Focus your summary and recommendations on desktop-specific impact — keyboard navigation, screen reader compatibility, focus indicators, and hover interactions.`;

  const userPrompt = `
Analyze these accessibility violations and provide:
1. A 2-3 sentence summary of the overall accessibility state
2. The most important issues to address, as a JSON array called "topIssues". Each entry should be a brief, one-line description with user impact. Include between 1 and 5 issues — use your judgment based on the number and diversity of violations. If there is only one distinct problem, return just one issue. If there are many different problems, return up to 5. Never repeat the same issue in different words.${platformInstruction}
${viewportContext}

Confirmed findings:
${JSON.stringify(aiInput, null, 2)}

Format your response as JSON:
{
  "summary": "...",
  "topIssues": ["issue 1", "...up to 5"]${platformJsonField}
}
`;

  const completion = await openai.chat.completions.create({
    model,
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

  // Extract optional platform tip
  const platformTip =
    typeof response.platformTip === "string" && response.platformTip.trim()
      ? response.platformTip.trim()
      : undefined;
  const reviewNote = review.length > 0
    ? ` Manual review is also recommended for ${review.length} lower-confidence item${review.length === 1 ? "" : "s"}.`
    : "";

  return {
    summary: `${response.summary || "Analysis complete."}${reviewNote}`.trim(),
    topIssues,
    model,
    ...(platformTip ? { platformTip } : {}),
  };
}
