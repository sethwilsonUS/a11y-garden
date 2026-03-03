/**
 * Violation Grouping & Normalization Utility
 *
 * Takes raw axe-core violation arrays and produces a normalized, deduplicated,
 * grouped, and prioritized structure suitable for prompt construction.
 *
 * Pure function — no Convex context needed, no OpenAI calls.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface GroupedViolation {
  ruleId: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  description: string;
  helpUrl: string;
  wcagTags: string[];
  selectors: string[];
  htmlSnippets: string[];
  nodeCount: number;
}

export type GroupedViolations = GroupedViolation[];

interface AxeNode {
  target: string[];
  html: string;
}

interface AxeViolation {
  id: string;
  impact?: "critical" | "serious" | "moderate" | "minor";
  description?: string;
  helpUrl?: string;
  tags?: string[];
  nodes?: AxeNode[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const IMPACT_ORDER: Record<string, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

const DEFAULT_MAX_GROUPS = 30;

// ═══════════════════════════════════════════════════════════════════════════
// Implementation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Groups raw axe-core violations by rule ID, deduplicates selectors,
 * sorts by impact severity, and caps the total number of groups.
 *
 * @param desktopViolations - Parsed axe-core violations from desktop viewport
 * @param mobileViolations  - Optional parsed axe-core violations from mobile viewport
 * @param maxGroups         - Maximum number of violation groups to return (default 30)
 */
export function groupViolations(
  desktopViolations: AxeViolation[],
  mobileViolations?: AxeViolation[],
  maxGroups: number = DEFAULT_MAX_GROUPS,
): GroupedViolations {
  const allViolations = mobileViolations
    ? [...desktopViolations, ...mobileViolations]
    : desktopViolations;

  if (allViolations.length === 0) return [];

  const groupMap = new Map<string, {
    impact: GroupedViolation["impact"];
    description: string;
    helpUrl: string;
    wcagTags: string[];
    selectorSet: Set<string>;
    snippetSet: Set<string>;
    nodeCount: number;
  }>();

  for (const violation of allViolations) {
    const ruleId = violation.id;
    const existing = groupMap.get(ruleId);

    if (existing) {
      for (const node of violation.nodes ?? []) {
        const selector = node.target.join(" ");
        existing.selectorSet.add(selector);
        existing.snippetSet.add(node.html);
        existing.nodeCount++;
      }
    } else {
      const selectorSet = new Set<string>();
      const snippetSet = new Set<string>();
      let nodeCount = 0;

      for (const node of violation.nodes ?? []) {
        const selector = node.target.join(" ");
        selectorSet.add(selector);
        snippetSet.add(node.html);
        nodeCount++;
      }

      groupMap.set(ruleId, {
        impact: violation.impact ?? "moderate",
        description: violation.description ?? "",
        helpUrl: violation.helpUrl ?? "",
        wcagTags: violation.tags ?? [],
        selectorSet,
        snippetSet,
        nodeCount,
      });
    }
  }

  const groups: GroupedViolations = Array.from(groupMap.entries()).map(
    ([ruleId, data]) => ({
      ruleId,
      impact: data.impact,
      description: data.description,
      helpUrl: data.helpUrl,
      wcagTags: data.wcagTags,
      selectors: Array.from(data.selectorSet),
      htmlSnippets: Array.from(data.snippetSet),
      nodeCount: data.nodeCount,
    }),
  );

  groups.sort(
    (a, b) => (IMPACT_ORDER[a.impact] ?? 99) - (IMPACT_ORDER[b.impact] ?? 99),
  );

  return groups.slice(0, maxGroups);
}
