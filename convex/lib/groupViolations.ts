/**
 * Finding Grouping Utility
 *
 * Takes normalized accessibility findings from one or more viewports and
 * produces a deduplicated structure suitable for prompt construction.
 */

export interface GroupedViolation {
  ruleId: string;
  title: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  description: string;
  helpUrl: string;
  wcagTags: string[];
  selectors: string[];
  htmlSnippets: string[];
  nodeCount: number;
  engines: string[];
  viewports: Array<"desktop" | "mobile">;
}

export type GroupedViolations = GroupedViolation[];

interface FindingNode {
  selector?: string;
  target?: string[];
  html?: string;
}

interface AuditFinding {
  id: string;
  dedupKey?: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  help?: string;
  description?: string;
  helpUrl?: string;
  wcagTags?: string[];
  wcagCriteria?: string[];
  tags?: string[];
  totalNodes?: number;
  engines?: string[];
  nodes?: FindingNode[];
}

const IMPACT_ORDER: Record<string, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

export const DEFAULT_MAX_GROUPS = 30;
const ENGINE_ORDER = ["axe", "ace", "htmlcs"] as const;
const VIEWPORT_ORDER = ["desktop", "mobile"] as const;

function getFindingNodeCount(finding: AuditFinding): number {
  return Math.max(finding.totalNodes ?? 0, finding.nodes?.length ?? 0);
}

function sortEngines(engines: Iterable<string>): string[] {
  const unique = [...new Set(engines)];
  return unique.sort((left, right) => {
    const leftIndex = ENGINE_ORDER.indexOf(left as (typeof ENGINE_ORDER)[number]);
    const rightIndex = ENGINE_ORDER.indexOf(right as (typeof ENGINE_ORDER)[number]);
    const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    if (normalizedLeft !== normalizedRight) {
      return normalizedLeft - normalizedRight;
    }
    return left.localeCompare(right);
  });
}

function sortViewports(
  viewports: Iterable<"desktop" | "mobile">,
): Array<"desktop" | "mobile"> {
  return [...new Set(viewports)].sort(
    (left, right) => VIEWPORT_ORDER.indexOf(left) - VIEWPORT_ORDER.indexOf(right),
  );
}

export function groupViolations(
  desktopFindings: AuditFinding[],
  mobileFindings?: AuditFinding[],
  maxGroups: number = DEFAULT_MAX_GROUPS,
): GroupedViolations {
  const allFindings = [
    ...desktopFindings.map((finding) => ({ finding, viewport: "desktop" as const })),
    ...(mobileFindings ?? []).map((finding) => ({ finding, viewport: "mobile" as const })),
  ];

  if (allFindings.length === 0) return [];

  const groupMap = new Map<string, {
    ruleId: string;
    title: string;
    impact: GroupedViolation["impact"];
    description: string;
    helpUrl: string;
    wcagTags: string[];
    selectorSet: Set<string>;
    snippetSet: Set<string>;
    nodeCount: number;
    engineSet: Set<string>;
    viewportSet: Set<"desktop" | "mobile">;
  }>();

  for (const { finding, viewport } of allFindings) {
    const groupKey = finding.dedupKey ?? finding.id;
    const existing = groupMap.get(groupKey);
    const tags =
      finding.wcagCriteria && finding.wcagCriteria.length > 0
        ? finding.wcagCriteria
        : (finding.wcagTags ?? finding.tags ?? []);
    const title = finding.help ?? finding.description ?? finding.id;

    if (existing) {
      for (const node of finding.nodes ?? []) {
        existing.selectorSet.add(node.selector ?? node.target?.join(" ") ?? "document");
        if (node.html) existing.snippetSet.add(node.html);
      }
      existing.nodeCount += getFindingNodeCount(finding);
      if ((!existing.title || existing.title === existing.ruleId) && title) {
        existing.title = title;
      }
      if (!existing.helpUrl && finding.helpUrl) {
        existing.helpUrl = finding.helpUrl;
      }
      if (existing.description.length === 0 && finding.description) {
        existing.description = finding.description;
      }
      existing.wcagTags = Array.from(new Set([...existing.wcagTags, ...tags]));
      for (const engine of finding.engines ?? []) {
        existing.engineSet.add(engine);
      }
      existing.viewportSet.add(viewport);
      continue;
    }

    const selectorSet = new Set<string>();
    const snippetSet = new Set<string>();
    const nodeCount = getFindingNodeCount(finding);

    for (const node of finding.nodes ?? []) {
      selectorSet.add(node.selector ?? node.target?.join(" ") ?? "document");
      if (node.html) snippetSet.add(node.html);
    }

    groupMap.set(groupKey, {
      ruleId: finding.id,
      title,
      impact: finding.impact,
      description: finding.description ?? "",
      helpUrl: finding.helpUrl ?? "",
      wcagTags: [...tags],
      selectorSet,
      snippetSet,
      nodeCount,
      engineSet: new Set(finding.engines ?? []),
      viewportSet: new Set([viewport]),
    });
  }

  const groups: GroupedViolations = Array.from(groupMap.values()).map(
    (data) => ({
      ruleId: data.ruleId,
      title: data.title,
      impact: data.impact,
      description: data.description,
      helpUrl: data.helpUrl,
      wcagTags: data.wcagTags,
      selectors: Array.from(data.selectorSet),
      htmlSnippets: Array.from(data.snippetSet),
      nodeCount: data.nodeCount,
      engines: sortEngines(data.engineSet),
      viewports: sortViewports(data.viewportSet),
    }),
  );

  groups.sort(
    (a, b) => (IMPACT_ORDER[a.impact] ?? 99) - (IMPACT_ORDER[b.impact] ?? 99),
  );

  return groups.slice(0, maxGroups);
}
