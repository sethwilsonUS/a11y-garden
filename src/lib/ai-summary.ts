/**
 * AI-powered accessibility analysis
 *
 * Standalone OpenAI integration for the CLI and local demo mode.
 * The Convex action (convex/ai.ts) handles the same logic for the web app.
 */

import OpenAI from "openai";

export interface AISummaryResult {
  summary: string;
  topIssues: string[];
  model: string;
}

/** Default model used by the CLI and production Convex action */
export const DEFAULT_AI_MODEL = "gpt-4.1-mini";

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
 * Pricing sourced from platform.openai.com/docs/models (Feb 2026).
 */
export const AVAILABLE_MODELS: ModelOption[] = [
  { id: "gpt-4o-mini",  label: "GPT-4o Mini",  description: "Fast & cheap",            inputPrice: 0.15,  outputPrice: 0.60  },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini",  description: "Default",                inputPrice: 0.40,  outputPrice: 1.60  },
  { id: "o3-mini",      label: "o3-mini",        description: "Reasoning model",        inputPrice: 1.10,  outputPrice: 4.40  },
  { id: "gpt-5",        label: "GPT-5",          description: "Flagship",               inputPrice: 1.25,  outputPrice: 10.00 },
  { id: "gpt-4.1",      label: "GPT-4.1",       description: "Strong all-rounder",     inputPrice: 2.00,  outputPrice: 8.00  },
  { id: "gpt-4o",       label: "GPT-4o",        description: "Multimodal",              inputPrice: 2.50,  outputPrice: 10.00 },
];

/**
 * Format a model's pricing for display (e.g. "$0.15 in / $0.60 out").
 * Prices are per 1M tokens.
 */
export function formatModelPrice(model: ModelOption): string {
  const fmt = (n: number) => n < 1 ? `$${n.toFixed(2)}` : `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
  return `${fmt(model.inputPrice)} in / ${fmt(model.outputPrice)} out`;
}

/**
 * Generate an AI summary and top issues list from raw axe-core violations.
 *
 * Uses OpenAI with the same prompt as the Convex action.
 * Requires OPENAI_API_KEY to be set in the environment.
 *
 * @param rawViolations - JSON string of axe-core violations
 * @param model - OpenAI model ID to use (defaults to gpt-4.1-mini)
 * @returns AI-generated summary, top issues, and which model was used
 */
export async function generateAISummary(
  rawViolations: string,
  model: string = DEFAULT_AI_MODEL,
): Promise<AISummaryResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY environment variable is not set. Use --no-ai to skip.",
    );
  }

  const openai = new OpenAI({ apiKey });

  const violations = JSON.parse(rawViolations);

  // If no violations, return a positive summary
  if (violations.length === 0) {
    return {
      summary:
        "Excellent! This page passed all automated accessibility checks. While automated testing can't catch every accessibility issue, this is a great foundation. Consider manual testing with assistive technologies for comprehensive coverage.",
      topIssues: [],
      model,
    };
  }

  // Same prompts as convex/ai.ts — kept in sync manually
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

  return {
    summary: response.summary || "Analysis complete.",
    topIssues,
    model,
  };
}
