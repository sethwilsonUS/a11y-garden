/**
 * Agent Plan Prompt Builder
 *
 * Takes GroupedViolation[] + audit metadata and constructs a structured
 * system/user prompt pair for GPT-4.1 Mini to generate an AGENTS.md file.
 *
 * Pure function — no Convex context or OpenAI calls.
 */

import type { GroupedViolation } from "./groupViolations";

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const PLATFORM_LABELS: Record<string, string> = {
  wordpress: "WordPress", squarespace: "Squarespace", shopify: "Shopify",
  wix: "Wix", webflow: "Webflow", drupal: "Drupal", joomla: "Joomla",
  ghost: "Ghost", hubspot: "HubSpot", weebly: "Weebly",
  nextjs: "Next.js", nuxt: "Nuxt", gatsby: "Gatsby", angular: "Angular",
  remix: "Remix", astro: "Astro", react: "React", vue: "Vue", svelte: "Svelte",
};

const MEDIUM_CONFIDENCE_PLATFORMS = new Set(["react", "vue", "svelte"]);

const MAX_SELECTORS_PER_VIOLATION = 3;
const MAX_SNIPPETS_PER_VIOLATION = 2;

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface PromptInput {
  violations: GroupedViolation[];
  platform: string;
  url: string;
  auditDate: string;
  pageTitle?: string;
}

export interface PromptOutput {
  systemPrompt: string;
  userPrompt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Implementation
// ═══════════════════════════════════════════════════════════════════════════

function resolvePlatformName(slug: string): string {
  if (!slug) return "generic web application";
  return PLATFORM_LABELS[slug] ?? "generic web application";
}

function isMediumConfidence(slug: string): boolean {
  return MEDIUM_CONFIDENCE_PLATFORMS.has(slug);
}

function formatViolation(v: GroupedViolation): string {
  const selectors = v.selectors.slice(0, MAX_SELECTORS_PER_VIOLATION);
  const snippets = v.htmlSnippets
    .slice(0, MAX_SNIPPETS_PER_VIOLATION)
    .map((s) => `\`${s}\``);

  let line = `- **${v.ruleId}** [${v.impact}] (${v.nodeCount} node${v.nodeCount === 1 ? "" : "s"})`;
  line += `\n  ${v.description}`;
  if (v.wcagTags.length > 0) {
    line += `\n  WCAG: ${v.wcagTags.join(", ")}`;
  }
  line += `\n  Selectors: ${selectors.join(", ")}`;
  if (snippets.length > 0) {
    line += `\n  HTML: ${snippets.join(" | ")}`;
  }
  if (v.helpUrl) {
    line += `\n  Ref: ${v.helpUrl}`;
  }
  return line;
}

function buildSystemPrompt(): string {
  return `You are an expert accessibility engineer who writes AGENTS.md instruction files for AI coding assistants (Cursor, Codex, Claude Code). Your output is a single markdown file that an AI agent will follow to fix WCAG accessibility violations in a codebase.

Write clear, imperative instructions. Use verbs like "Find", "Add", "Replace", "Remove", "Wrap". Each fix instruction must be specific enough for an automated agent to locate and modify the correct source code.

The AGENTS.md file you produce must have these sections:
- Overview (site URL, audit date, framework, total violations)
- Critical Fixes (if any)
- Serious Fixes (if any)
- Moderate Fixes (if any)
- Minor Fixes (if any — keep brief)
- Verification Steps (how to confirm fixes)
- Don'ts (common mistakes to avoid)

Here are examples of well-formed fix instructions:

Example 1 — missing alt text:
> Find all \`<img>\` elements rendered by the HeroImage component that lack an \`alt\` attribute. Add descriptive alt text that conveys the image's purpose. If the image is decorative, use \`alt=""\`.

Example 2 — non-interactive element used as button:
> Search the codebase for the component that renders the \`div.cta-button\` selector. Replace the \`<div>\` with a \`<button>\` element and ensure it has an accessible name via its text content or \`aria-label\`.`;
}

function buildUserPrompt(input: PromptInput): string {
  const platformName = resolvePlatformName(input.platform);
  const mediumConfidence = isMediumConfidence(input.platform);

  const hedgeNote = mediumConfidence
    ? `\n\nNote: The site appears to use ${platformName} based on HTML markers, but detection is not 100% certain. Frame your framework-specific advice accordingly — mention the framework but note the detection may not be accurate.`
    : "";

  const pageInfo = input.pageTitle
    ? `Page: "${input.pageTitle}" at ${input.url}`
    : `URL: ${input.url}`;

  const critical = input.violations.filter((v) => v.impact === "critical");
  const serious = input.violations.filter((v) => v.impact === "serious");
  const moderate = input.violations.filter((v) => v.impact === "moderate");
  const minor = input.violations.filter((v) => v.impact === "minor");

  const sections: string[] = [];

  if (critical.length > 0) {
    sections.push(`### Critical\n${critical.map(formatViolation).join("\n")}`);
  }
  if (serious.length > 0) {
    sections.push(`### Serious\n${serious.map(formatViolation).join("\n")}`);
  }
  if (moderate.length > 0) {
    sections.push(`### Moderate\n${moderate.map(formatViolation).join("\n")}`);
  }
  if (minor.length > 0) {
    sections.push(`### Minor\n${minor.map(formatViolation).join("\n")}`);
  }

  const violationBlock = sections.join("\n\n");

  return `Generate an AGENTS.md file for the following accessibility audit.

Framework: ${platformName}
${pageInfo}
Audit date: ${input.auditDate}
Total violations: ${input.violations.length}${hedgeNote}

## Violations

${violationBlock}

## Instructions

- Generate ${platformName}-specific code examples where relevant.
- Selectors reference the rendered DOM. Instruct the agent to search the codebase for the source components that produce these selectors.
- Use imperative verbs: "Find the component…", "Add aria-label…", "Replace div with button…".
- Do NOT suggest installing new dependencies unless absolutely necessary.
- Group fixes by severity section (Critical Fixes, Serious Fixes, Moderate Fixes, Minor Fixes).
- Include a Verification section with steps to confirm each fix.
- Include a Don'ts section warning against common accessibility anti-patterns.
- Keep the output concise and actionable.
- Output raw markdown directly. Do NOT wrap the entire response in a code fence (\`\`\`markdown ... \`\`\`).`;
}

export function buildAgentPlanPrompt(input: PromptInput): PromptOutput {
  return {
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(input),
  };
}
