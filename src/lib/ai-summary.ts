/**
 * AI-powered accessibility analysis
 *
 * Standalone OpenAI integration for the CLI.
 * The Convex action (convex/ai.ts) handles the same logic for the web app.
 */

import OpenAI from "openai";

export interface AISummaryResult {
  summary: string;
  topIssues: string[];
}

/**
 * Generate an AI summary and top issues list from raw axe-core violations.
 *
 * Uses OpenAI GPT-4o-mini with the same prompt as the Convex action.
 * Requires OPENAI_API_KEY to be set in the environment.
 *
 * @param rawViolations - JSON string of axe-core violations
 * @returns AI-generated summary and top issues
 */
export async function generateAISummary(
  rawViolations: string,
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
    };
  }

  // Same prompts as convex/ai.ts — kept in sync manually
  const systemPrompt = `You are an accessibility expert translating technical WCAG violations into plain English for web developers and site owners. Focus on user impact and actionable fixes. Be concise and helpful.`;

  const userPrompt = `
Analyze these accessibility violations and provide:
1. A 2-3 sentence summary of the overall accessibility state
2. The top 3 most critical issues (brief, one-line descriptions with user impact)

Violations:
${JSON.stringify(violations.slice(0, 10), null, 2)}

Format your response as JSON:
{
  "summary": "...",
  "topIssues": ["issue 1", "issue 2", "issue 3"]
}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
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

  return {
    summary: response.summary || "Analysis complete.",
    topIssues: response.topIssues || [],
  };
}
