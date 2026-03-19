import {
  compareImpact,
  computeFindingDedupKey,
  getBestEngine,
  getPrimarySelector,
  normalizeTextToken,
  sortEngines,
  type AuditFinding,
  type AuditFindingNode,
  type EngineName,
} from "@/lib/findings";

const ENGINE_METADATA_PRIORITY: Record<EngineName, number> = {
  axe: 0,
  ace: 1,
  htmlcs: 2,
};

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function dedupeNodes(nodes: AuditFindingNode[]): AuditFindingNode[] {
  const seen = new Set<string>();
  const deduped: AuditFindingNode[] = [];

  for (const node of nodes) {
    const key = [
      node.selector,
      node.target?.join(" ") ?? "",
      node.xpath ?? "",
      node.html ?? "",
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(node);
  }

  return deduped;
}

function findingIntent(finding: AuditFinding): string {
  if (finding.wcagCriteria.length > 0) {
    return [...finding.wcagCriteria].sort().join("|");
  }

  return normalizeTextToken(finding.help || finding.id);
}

function selectorsOverlap(
  left: AuditFinding,
  right: AuditFinding,
): boolean {
  const leftSelectors = new Set(
    left.nodes
      .map((node) => node.selector || node.target?.join(" ") || "")
      .filter(Boolean),
  );

  const rightSelectors = right.nodes
    .map((node) => node.selector || node.target?.join(" ") || "")
    .filter(Boolean);

  if (leftSelectors.size === 0 || rightSelectors.length === 0) {
    return getPrimarySelector(left) === getPrimarySelector(right);
  }

  return rightSelectors.some((selector) => leftSelectors.has(selector));
}

function shouldMergeFindings(
  left: AuditFinding,
  right: AuditFinding,
): boolean {
  if (left.disposition !== right.disposition) return false;
  if (!selectorsOverlap(left, right)) return false;

  const leftCriteria = new Set(left.wcagCriteria);
  const sharedCriteria = right.wcagCriteria.some((item) => leftCriteria.has(item));
  if (leftCriteria.size > 0 && right.wcagCriteria.length > 0) {
    return sharedCriteria;
  }

  return findingIntent(left) === findingIntent(right);
}

function mergeEngineRuleIds(
  left: AuditFinding["engineRuleIds"],
  right: AuditFinding["engineRuleIds"],
): AuditFinding["engineRuleIds"] {
  const merged: AuditFinding["engineRuleIds"] = { ...left };

  for (const [engine, ruleIds] of Object.entries(right) as Array<
    [EngineName, string[] | undefined]
  >) {
    merged[engine] = dedupeStrings([
      ...(merged[engine] ?? []),
      ...(ruleIds ?? []),
    ]);
  }

  return merged;
}

function isPreferredMetadata(
  current: AuditFinding,
  incoming: AuditFinding,
): boolean {
  const currentRank = ENGINE_METADATA_PRIORITY[getBestEngine(current.engines)];
  const incomingRank = ENGINE_METADATA_PRIORITY[getBestEngine(incoming.engines)];
  return incomingRank < currentRank;
}

export function deduplicateFindings(
  findings: AuditFinding[],
): AuditFinding[] {
  const merged: AuditFinding[] = [];

  for (const finding of findings) {
    const existing = merged.find((candidate) =>
      shouldMergeFindings(candidate, finding),
    );

    if (!existing) {
      merged.push({
        ...finding,
        engines: sortEngines(finding.engines),
        engineRuleIds: mergeEngineRuleIds({}, finding.engineRuleIds),
        wcagCriteria: dedupeStrings(finding.wcagCriteria),
        wcagTags: dedupeStrings(finding.wcagTags),
        nodes: dedupeNodes(finding.nodes),
      });
      continue;
    }

    existing.engines = sortEngines([...existing.engines, ...finding.engines]);
    existing.engineRuleIds = mergeEngineRuleIds(
      existing.engineRuleIds,
      finding.engineRuleIds,
    );
    existing.wcagCriteria = dedupeStrings([
      ...existing.wcagCriteria,
      ...finding.wcagCriteria,
    ]);
    existing.wcagTags = dedupeStrings([
      ...existing.wcagTags,
      ...finding.wcagTags,
    ]);
    existing.nodes = dedupeNodes([...existing.nodes, ...finding.nodes]);

    if (compareImpact(finding.impact, existing.impact) < 0) {
      existing.impact = finding.impact;
    }

    if (isPreferredMetadata(existing, finding)) {
      existing.id = finding.id;
      existing.help = finding.help;
      existing.description = finding.description;
      existing.helpUrl = finding.helpUrl ?? existing.helpUrl;
    } else if (!existing.helpUrl && finding.helpUrl) {
      existing.helpUrl = finding.helpUrl;
    }
  }

  return merged
    .map((finding) => ({
      ...finding,
      dedupKey: computeFindingDedupKey(
        finding.disposition,
        getPrimarySelector(finding),
        finding.wcagCriteria,
        finding.id,
      ),
    }))
    .sort((left, right) => {
      if (left.disposition !== right.disposition) {
        return left.disposition === "confirmed" ? -1 : 1;
      }

      const impactComparison = compareImpact(left.impact, right.impact);
      if (impactComparison !== 0) return impactComparison;

      return left.help.localeCompare(right.help);
    });
}
