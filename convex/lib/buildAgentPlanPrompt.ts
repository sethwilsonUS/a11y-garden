/**
 * Agent Plan Prompt Builder
 *
 * Takes GroupedViolation[] + audit metadata and constructs a structured
 * system/user prompt pair for GPT-5.4 Mini to generate an AGENTS.md file.
 *
 * Pure function — no Convex context or OpenAI calls.
 */

import type { EngineProfile } from "../../src/lib/findings";
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
const MAX_SNIPPETS_PER_VIOLATION = 1;
const ENGINE_LABELS: Record<string, string> = {
  axe: "axe-core",
  ace: "IBM ACE",
  htmlcs: "HTML_CodeSniffer",
};

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface PromptInput {
  violations: GroupedViolation[];
  platform: string;
  url: string;
  auditDate: string;
  pageTitle?: string;
  scanProfile?: EngineProfile;
  totalConfirmedFindings?: number;
  totalGroupedIssues?: number;
  coverageNotes?: string[];
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

function formatEngineList(engines: string[]): string {
  return engines.map((engine) => ENGINE_LABELS[engine] ?? engine).join(", ");
}

function getConfidenceHint(v: GroupedViolation): string | null {
  if (v.engines.length > 1) {
    return "Strong signal: confirmed by multiple engines, so direct remediation guidance is appropriate.";
  }

  const [engine] = v.engines;
  if (engine === "ace" || engine === "htmlcs") {
    return `Verify-first signal: reported only by ${ENGINE_LABELS[engine] ?? engine}. Inspect the rendered DOM/state before changing source unless the evidence clearly points to a concrete bug.`;
  }

  return null;
}

function formatViewportList(
  viewports: Array<"desktop" | "mobile">,
): string {
  if (viewports.length === 2) return "desktop and mobile";
  return viewports[0] ?? "desktop";
}

function formatViolation(v: GroupedViolation): string {
  const selectors = v.selectors.slice(0, MAX_SELECTORS_PER_VIOLATION);
  const snippets = v.htmlSnippets
    .slice(0, MAX_SNIPPETS_PER_VIOLATION)
    .map((s) => `\`${s}\``);

  let line = `- **${v.title}** (\`${v.ruleId}\`) [${v.impact}] (${v.nodeCount} affected node${v.nodeCount === 1 ? "" : "s"})`;
  line += `\n  ${v.description}`;
  if (v.engines.length > 1 || (v.engines.length === 1 && v.engines[0] !== "axe")) {
    line += `\n  Confirmed by: ${formatEngineList(v.engines)}`;
  }
  const confidenceHint = getConfidenceHint(v);
  if (confidenceHint) {
    line += `\n  Confidence: ${confidenceHint}`;
  }
  if (v.viewports.length > 1 || (v.viewports.length === 1 && v.viewports[0] === "mobile")) {
    line += `\n  Viewports: ${formatViewportList(v.viewports)}`;
  }
  if (v.wcagTags.length > 0) {
    line += `\n  WCAG: ${v.wcagTags.join(", ")}`;
  }
  if (selectors.length > 0) {
    line += `\n  Selectors: ${selectors.join(", ")}`;
  }
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

Base every fix on the rendered DOM evidence provided, but remember that rendered DOM and source code do not always map 1:1. When a finding could be caused by wrappers, duplicate IDs, hydration, or custom controls, tell the agent to verify the rendered markup first and then patch the source that produces it. If the source already appears correct, instruct the agent to look for the mismatch instead of rewriting valid markup blindly.

DOM snippets in the prompt are rendered HTML, not source JSX. Do not tell the agent to replace HTML attributes like \`for\` with JSX equivalents like \`htmlFor\` unless the prompt includes actual React source code showing the wrong attribute.

For contrast issues, instruct the agent to verify computed foreground/background colors and the CSS cascade, not just the class list shown in the snippet. Utility classes may be overridden by later component or global styles.

If multiple reported nodes appear to come from the same source component, shared token, or shared style rule, combine them into one remediation item. Mention the repeated instances in verification instead of creating duplicate fix bullets for what is really one source-level change.

If different rule IDs or engine findings appear to describe the same user-facing defect or the same component family, merge them into one remediation item whenever a single source change is likely to address them together. Different rule names are not, by themselves, a reason to create separate fix bullets.

If a target may exist only in a specific state or variant, such as signed-in UI, modal-open state, expanded navigation, or a particular viewport, require the AGENTS.md instructions to name that state explicitly in both the remediation and verification steps.

For document title findings, tell the agent to inspect the framework's existing head or metadata mechanism before proposing a new source change. In Next.js this may be \`metadata\` or \`generateMetadata\`; in Angular it may be the \`Title\` service or document head management; in other apps it may be a shared layout, router hook, or head component. If the route already appears to define a title, instruct the agent to verify the rendered \`<head>\` and scan context before editing source.

Use engine confidence to shape the tone of each remediation item. If a finding is confirmed by multiple engines, direct fix language is appropriate. If a finding is reported only by IBM ACE or HTML_CodeSniffer, default to verification-first wording unless the rendered evidence clearly identifies a concrete source bug.

When recommending HTML attributes or ARIA, only suggest values that are clearly valid and standards-compliant. Do not hedge with speculative alternatives. If the correct autofill token or attribute value is uncertain, prefer removing the invalid value or using a conservative safe value rather than suggesting a maybe-valid replacement.

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
> Search the codebase for the component that renders the \`div.cta-button\` selector. Replace the \`<div>\` with a \`<button>\` element and ensure it has an accessible name via its text content or \`aria-label\`.

Example 3 — rendered DOM/source mismatch:
> Inspect the rendered form control for the broken \`label[for]\` association. If the source already uses matching \`id\` and \`htmlFor\`, look for a custom control wrapper, duplicate \`id\`, or hydration mismatch before changing the markup. Keep a valid native association if one already exists.

Example 4 — contrast with possible cascade override:
> Find the component that renders the reported CTA. Verify the computed text and background colors in the rendered state, then adjust the source styles or tokens that actually win in the cascade. Do not assume utility classes in the snippet are the final rendered styles.

Example 5 — repeated findings with one shared source fix:
> If two rendered nodes point to the same CTA component or shared button token, write one fix item for the shared source change and note in verification that all reported instances must be rechecked.

Example 6 — conditional UI state:
> If the reported control only appears for signed-in users, say that explicitly. Tell the agent to verify the fix while authenticated instead of assuming the issue exists in the anonymous view.

Example 7 — document title verification before edits:
> Find the framework-level title or metadata path for the reported route first. If the route already defines a title through layout metadata, a router title service, or another head-management mechanism, verify the rendered \`<head>\` in the audited state before changing source. Only propose a code change when the title is actually missing or empty in the live page.

Example 8 — merge overlapping rules into one source fix:
> If \`link-name\`, \`a_text_purpose\`, and an HTML_CodeSniffer empty-anchor rule all point to the same shared icon-link component, write one fix item for that shared link component and list the affected rule families in verification rather than creating three separate remediation bullets.`;
}

function buildUserPrompt(input: PromptInput): string {
  const platformName = resolvePlatformName(input.platform);
  const mediumConfidence = isMediumConfidence(input.platform);
  const totalConfirmedFindings = input.totalConfirmedFindings ?? input.violations.length;
  const totalGroupedIssues = input.totalGroupedIssues ?? input.violations.length;
  const confirmedFindingLabel = totalConfirmedFindings === 1 ? "confirmed finding" : "confirmed findings";
  const groupedIssueLabel = totalGroupedIssues === 1 ? "grouped issue" : "grouped issues";
  const coverageNotes = [...(input.coverageNotes ?? [])];

  const hedgeNote = mediumConfidence
    ? `\n\nNote: The site appears to use ${platformName} based on HTML markers, but detection is not 100% certain. Frame your framework-specific advice accordingly — mention the framework but note the detection may not be accurate.`
    : "";

  if (totalGroupedIssues > input.violations.length) {
    coverageNotes.unshift(
      `This prompt includes the top ${input.violations.length} grouped confirmed issues out of ${totalGroupedIssues} total grouped confirmed issues to stay focused.`,
    );
  }

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
  const profileLine = input.scanProfile
    ? `Scan profile: ${input.scanProfile === "comprehensive" ? "Comprehensive" : "Strict"}\n`
    : "";
  const coverageSection = coverageNotes.length > 0
    ? `\n## Coverage Notes\n\n${coverageNotes.map((note) => `- ${note}`).join("\n")}\n`
    : "";

  return `Generate an AGENTS.md file for the following accessibility audit.

Framework: ${platformName}
${pageInfo}
Audit date: ${input.auditDate}
${profileLine}Confirmed findings available: ${totalConfirmedFindings} ${confirmedFindingLabel}
Grouped issues included in this prompt: ${input.violations.length} of ${totalGroupedIssues} ${groupedIssueLabel}${hedgeNote}${coverageSection}

## Confirmed Issues

${violationBlock}

## Instructions

- Generate ${platformName}-specific code examples where relevant.
- Selectors reference the rendered DOM. Instruct the agent to search the codebase for the source components that produce these selectors.
- DOM snippets are rendered HTML, not JSX source. Do not tell the agent to convert \`for\` to \`htmlFor\` unless actual source code is provided and shows the wrong JSX attribute.
- When a finding could come from a rendered/source mismatch, tell the agent to inspect the rendered DOM first, then fix the source responsible for the mismatch.
- For contrast findings, tell the agent to verify computed styles and whether utility classes are being overridden by component or global CSS.
- If multiple findings appear to share one source-level remedy, merge them into one remediation item and push the repeated-instance check into verification.
- If different rule IDs or engines appear to describe the same component family or the same user-facing defect, merge them into one remediation item whenever one source change is likely to address them together.
- If a target may be conditional on auth, UI state, or viewport, call out that required state explicitly in both the fix instructions and verification steps.
- For document title findings, tell the agent to inspect the framework's existing metadata or head-management path first and verify the rendered \`<head>\` before proposing a source change.
- If a finding is confirmed by multiple engines, direct remediation guidance is appropriate. If it is reported only by IBM ACE or HTML_CodeSniffer, default to verification-first wording unless the evidence clearly points to a concrete source bug.
- For form attribute findings, prefer conservative, clearly valid fixes. If the correct autocomplete token is uncertain, remove the invalid token or use a safe fallback such as \`autocomplete="off"\` instead of speculating.
- Treat issues confirmed by multiple engines as especially trustworthy.
- If an issue is mobile-only or spans both viewports, preserve the unaffected viewport while fixing it.
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
