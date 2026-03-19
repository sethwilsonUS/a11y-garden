export type EngineProfile = "strict" | "comprehensive";
export type EngineName = "axe" | "htmlcs" | "ace";
export type FindingDisposition = "confirmed" | "needs-review";
export type FindingImpact = "critical" | "serious" | "moderate" | "minor";

export interface ViolationCounts {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  total: number;
}

export interface AuditFindingNode {
  selector: string;
  target?: string[];
  html?: string;
  failureSummary?: string;
  xpath?: string;
}

export interface AuditFinding {
  id: string;
  dedupKey: string;
  engines: EngineName[];
  engineRuleIds: Partial<Record<EngineName, string[]>>;
  disposition: FindingDisposition;
  impact: FindingImpact;
  help: string;
  description: string;
  helpUrl?: string;
  wcagCriteria: string[];
  wcagTags: string[];
  totalNodes?: number;
  nodes: AuditFindingNode[];
}

export interface EngineExecutionSummary {
  engine: EngineName;
  status: "completed" | "failed" | "skipped";
  durationMs: number;
  confirmedCount: number;
  reviewCount: number;
  note?: string;
}

export interface EngineSummary {
  selectedEngines: EngineName[];
  engines: EngineExecutionSummary[];
}

export interface AxeNodeRaw {
  html?: string;
  target?: string[];
  failureSummary?: string;
  [key: string]: unknown;
}

export interface AxeViolationRaw {
  id: string;
  impact?: string;
  description?: string;
  help?: string;
  helpUrl?: string;
  tags?: string[];
  nodes: AxeNodeRaw[];
  [key: string]: unknown;
}

export const FINDINGS_VERSION = 2 as const;
export const MAX_RAW_FINDINGS_CHARS = 358_000;

const ENGINE_PRIORITY: Record<EngineName, number> = {
  axe: 0,
  ace: 1,
  htmlcs: 2,
};

const SERIOUS_CRITERIA = new Set([
  "1.1.1",
  "1.3.1",
  "1.3.2",
  "1.4.3",
  "1.4.4",
  "1.4.10",
  "1.4.11",
  "2.1.1",
  "2.1.2",
  "2.4.1",
  "2.4.3",
  "2.4.4",
  "2.4.6",
  "2.4.7",
  "2.5.3",
  "3.3.1",
  "3.3.2",
  "4.1.2",
  "4.1.3",
]);

const MINOR_CRITERIA = new Set([
  "2.4.2",
  "3.1.1",
  "3.2.4",
]);

const FALLBACK_SERIOUS_ID_RE =
  /alt|label|name|heading|focus|keyboard|lang|role|aria|caption|contrast|title|tabindex|skip|landmark|duplicate/i;

export function emptyViolationCounts(): ViolationCounts {
  return { critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 };
}

function normalizeImpact(
  value: string | undefined,
): FindingImpact {
  if (value === "critical") return "critical";
  if (value === "serious") return "serious";
  if (value === "moderate") return "moderate";
  return "minor";
}

function incrementCount(
  counts: ViolationCounts,
  impact: FindingImpact,
): void {
  counts[impact] += 1;
  counts.total += 1;
}

export function sortEngines(engines: EngineName[]): EngineName[] {
  return [...new Set(engines)].sort(
    (left, right) => ENGINE_PRIORITY[left] - ENGINE_PRIORITY[right],
  );
}

export function getBestEngine(engines: EngineName[]): EngineName {
  return sortEngines(engines)[0] ?? "axe";
}

export function compareImpact(
  left: FindingImpact,
  right: FindingImpact,
): number {
  const order: Record<FindingImpact, number> = {
    critical: 0,
    serious: 1,
    moderate: 2,
    minor: 3,
  };
  return order[left] - order[right];
}

export function getPrimarySelector(finding: AuditFinding): string {
  return (
    finding.nodes.find((node) => node.selector)?.selector ??
    finding.nodes.find((node) => (node.target?.length ?? 0) > 0)?.target?.join(" ") ??
    "document"
  );
}

export function normalizeTextToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function computeFindingDedupKey(
  disposition: FindingDisposition,
  selector: string,
  wcagCriteria: string[],
  fallbackId: string,
): string {
  const selectorKey = selector.trim().toLowerCase() || "document";
  const wcagKey = wcagCriteria.length
    ? [...wcagCriteria].sort().join("|")
    : normalizeTextToken(fallbackId) || "generic";
  return `${disposition}:${selectorKey}:${wcagKey}`;
}

export function normalizeWcagCriterion(raw: string): string | null {
  const cleaned = raw.replace(/_/g, ".").trim();
  const match = cleaned.match(/^(\d)\.(\d)\.(\d)$/);
  if (!match) return null;
  return `${match[1]}.${match[2]}.${match[3]}`;
}

export function extractWcagCriteriaFromAxeTags(
  tags: string[] = [],
): string[] {
  const criteria = new Set<string>();
  for (const tag of tags) {
    const match = tag.match(/^wcag(\d)(\d)(\d)$/i);
    if (!match) continue;
    criteria.add(`${match[1]}.${match[2]}.${match[3]}`);
  }
  return [...criteria].sort();
}

export function extractWcagCriteriaFromHtmlcsCode(
  code: string,
): string[] {
  const criteria = new Set<string>();
  const matches = code.matchAll(/Guideline\d+_\d+\.(\d+_\d+_\d+)/g);
  for (const match of matches) {
    const criterion = normalizeWcagCriterion(match[1]);
    if (criterion) criteria.add(criterion);
  }
  return [...criteria].sort();
}

function baseHeuristicImpact(
  ruleId: string,
  wcagCriteria: string[],
): FindingImpact {
  if (wcagCriteria.some((criterion) => SERIOUS_CRITERIA.has(criterion))) {
    return "serious";
  }

  if (wcagCriteria.some((criterion) => MINOR_CRITERIA.has(criterion))) {
    return "minor";
  }

  if (FALLBACK_SERIOUS_ID_RE.test(ruleId)) {
    return "serious";
  }

  return "moderate";
}

export function inferHeuristicImpact(
  ruleId: string,
  wcagCriteria: string[],
  disposition: FindingDisposition,
): FindingImpact {
  if (disposition === "needs-review") {
    return baseHeuristicImpact(ruleId, wcagCriteria);
  }

  return baseHeuristicImpact(ruleId, wcagCriteria);
}

function dedupeFindingNodes(
  nodes: AuditFindingNode[],
): AuditFindingNode[] {
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

export function countFindings(
  findings: AuditFinding[],
  disposition?: FindingDisposition,
): ViolationCounts {
  const counts = emptyViolationCounts();

  for (const finding of findings) {
    if (disposition && finding.disposition !== disposition) continue;
    incrementCount(counts, finding.impact);
  }

  return counts;
}

export function summarizeFindings(findings: AuditFinding[]): {
  confirmed: ViolationCounts;
  review: ViolationCounts;
} {
  return {
    confirmed: countFindings(findings, "confirmed"),
    review: countFindings(findings, "needs-review"),
  };
}

export function getFindingNodeCount(finding: AuditFinding): number {
  return Math.max(finding.totalNodes ?? 0, finding.nodes.length);
}

export function splitFindingsByDisposition(findings: AuditFinding[]): {
  confirmed: AuditFinding[];
  review: AuditFinding[];
} {
  return {
    confirmed: findings.filter((finding) => finding.disposition === "confirmed"),
    review: findings.filter((finding) => finding.disposition === "needs-review"),
  };
}

export function normalizeLegacyAxeViolations(
  violations: AxeViolationRaw[],
): AuditFinding[] {
  return violations.map((violation) => {
    const wcagCriteria = extractWcagCriteriaFromAxeTags(violation.tags);
    const nodes = dedupeFindingNodes(
      (violation.nodes ?? []).map((node) => ({
        selector: node.target?.join(" ") ?? "document",
        ...(node.target ? { target: [...node.target] } : {}),
        ...(node.html ? { html: node.html } : {}),
        ...(node.failureSummary
          ? { failureSummary: node.failureSummary }
          : {}),
      })),
    );

    return {
      id: violation.id,
      dedupKey: computeFindingDedupKey(
        "confirmed",
        nodes[0]?.selector ?? "document",
        wcagCriteria,
        violation.id,
      ),
      engines: ["axe"],
      engineRuleIds: { axe: [violation.id] },
      disposition: "confirmed",
      impact: normalizeImpact(violation.impact),
      help: violation.help ?? violation.id,
      description: violation.description ?? violation.help ?? violation.id,
      ...(violation.helpUrl ? { helpUrl: violation.helpUrl } : {}),
      wcagCriteria,
      wcagTags: [...(violation.tags ?? [])],
      nodes,
    };
  });
}

export function parseSerializedFindings(
  rawFindings?: string,
  rawViolations?: string,
): AuditFinding[] {
  if (rawFindings) {
    try {
      const parsed = JSON.parse(rawFindings) as unknown;
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) return [];

        const looksNormalized = parsed.every(
          (item) =>
            !!item &&
            typeof item === "object" &&
            "disposition" in item &&
            "engines" in item &&
            "engineRuleIds" in item &&
            "nodes" in item,
        );

        if (looksNormalized) {
          return parsed as AuditFinding[];
        }

        const looksLegacyAxe = parsed.every(
          (item) =>
            !!item &&
            typeof item === "object" &&
            "id" in item &&
            "nodes" in item &&
            !("disposition" in item),
        );

        if (looksLegacyAxe) {
          return normalizeLegacyAxeViolations(parsed as AxeViolationRaw[]);
        }
      }
    } catch {
      // Fall through to legacy parsing.
    }
  }

  if (rawViolations) {
    try {
      const parsed = JSON.parse(rawViolations) as AxeViolationRaw[];
      return Array.isArray(parsed)
        ? normalizeLegacyAxeViolations(parsed)
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

export function truncateFindings(findings: AuditFinding[]): {
  serialized: string;
  truncated: boolean;
} {
  let serialized = JSON.stringify(findings);
  if (serialized.length <= MAX_RAW_FINDINGS_CHARS) {
    return { serialized, truncated: false };
  }

  const trimmed: AuditFinding[] = JSON.parse(serialized);

  for (let pass = 0; pass < 100; pass += 1) {
    serialized = JSON.stringify(trimmed);
    if (serialized.length <= MAX_RAW_FINDINGS_CHARS) break;

    const detailIndex = findBestDetailTrimCandidate(trimmed);
    if (detailIndex !== -1 && applyNextDetailTrim(trimmed[detailIndex])) {
      continue;
    }

    const nodeIndex = findBestNodeSamplingCandidate(trimmed);
    if (nodeIndex === -1 || !applyNodeSampling(trimmed[nodeIndex])) {
      break;
    }
  }

  serialized = JSON.stringify(trimmed);
  return { serialized, truncated: true };
}

const DETAIL_TRIM_THRESHOLDS = [5, 3, 1, 0] as const;

function getFindingSerializedSize(finding: AuditFinding): number {
  return JSON.stringify(finding).length;
}

function hasTrimCandidateBeyondThreshold(
  finding: AuditFinding,
  preserveNodes: number,
): boolean {
  return finding.nodes.some((node, index) => {
    if (index < preserveNodes) return false;
    return (
      node.html !== undefined ||
      node.failureSummary !== undefined ||
      node.xpath !== undefined ||
      (!!node.selector && !!node.target)
    );
  });
}

function trimDetailsBeyondThreshold(
  finding: AuditFinding,
  preserveNodes: number,
): boolean {
  let changed = false;

  for (let index = preserveNodes; index < finding.nodes.length; index += 1) {
    const node = finding.nodes[index];

    if (node.html !== undefined) {
      delete node.html;
      changed = true;
    }
    if (node.failureSummary !== undefined) {
      delete node.failureSummary;
      changed = true;
    }
    if (node.xpath !== undefined) {
      delete node.xpath;
      changed = true;
    }
    if (node.selector && node.target !== undefined) {
      delete node.target;
      changed = true;
    }
  }

  return changed;
}

function applyNextDetailTrim(finding: AuditFinding): boolean {
  for (const preserveNodes of DETAIL_TRIM_THRESHOLDS) {
    if (!hasTrimCandidateBeyondThreshold(finding, preserveNodes)) {
      continue;
    }

    return trimDetailsBeyondThreshold(finding, preserveNodes);
  }

  return false;
}

function findBestDetailTrimCandidate(findings: AuditFinding[]): number {
  let bestIndex = -1;
  let bestSize = 0;

  for (let index = 0; index < findings.length; index += 1) {
    if (!DETAIL_TRIM_THRESHOLDS.some((threshold) =>
      hasTrimCandidateBeyondThreshold(findings[index], threshold),
    )) {
      continue;
    }

    const size = getFindingSerializedSize(findings[index]);
    if (size > bestSize) {
      bestSize = size;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function sampleNodesEvenly(
  nodes: AuditFindingNode[],
  keepCount: number,
): AuditFindingNode[] {
  if (keepCount >= nodes.length) return [...nodes];
  if (keepCount <= 1) return nodes.length > 0 ? [nodes[0]] : [];

  const indices = new Set<number>();

  for (let slot = 0; slot < keepCount; slot += 1) {
    const ratio = slot / (keepCount - 1);
    const index = Math.round(ratio * (nodes.length - 1));
    indices.add(index);
  }

  if (indices.size < keepCount) {
    for (let index = 0; index < nodes.length && indices.size < keepCount; index += 1) {
      indices.add(index);
    }
  }

  return [...indices]
    .sort((left, right) => left - right)
    .slice(0, keepCount)
    .map((index) => nodes[index]);
}

function getNextSampleSize(nodeCount: number): number {
  if (nodeCount <= 2) return 1;
  if (nodeCount <= 20) return Math.max(1, nodeCount - 2);
  if (nodeCount <= 100) return Math.max(1, Math.ceil(nodeCount * 0.75));
  return Math.max(1, Math.ceil(nodeCount * 0.6));
}

function applyNodeSampling(finding: AuditFinding): boolean {
  if (finding.nodes.length <= 1) return false;

  const keepCount = getNextSampleSize(finding.nodes.length);
  if (keepCount >= finding.nodes.length) return false;

  finding.totalNodes = getFindingNodeCount(finding);
  finding.nodes = sampleNodesEvenly(finding.nodes, keepCount);
  return true;
}

function findBestNodeSamplingCandidate(findings: AuditFinding[]): number {
  let bestIndex = -1;
  let bestSize = 0;

  for (let index = 0; index < findings.length; index += 1) {
    if ((findings[index].nodes?.length ?? 0) <= 1) continue;

    const size = getFindingSerializedSize(findings[index]);
    if (size > bestSize) {
      bestSize = size;
      bestIndex = index;
    }
  }

  return bestIndex;
}

export function truncateViolations(
  violations: AxeViolationRaw[],
): {
  serialized: string;
  truncated: boolean;
} {
  let serialized = JSON.stringify(violations);
  if (serialized.length <= MAX_RAW_FINDINGS_CHARS) {
    return { serialized, truncated: false };
  }

  const trimmed: AxeViolationRaw[] = JSON.parse(serialized);

  for (let pass = 0; pass < 50; pass += 1) {
    serialized = JSON.stringify(trimmed);
    if (serialized.length <= MAX_RAW_FINDINGS_CHARS) break;

    let maxIndex = -1;
    let maxNodes = 1;

    for (let index = 0; index < trimmed.length; index += 1) {
      const nodeCount = trimmed[index].nodes?.length ?? 0;
      if (nodeCount > maxNodes) {
        maxNodes = nodeCount;
        maxIndex = index;
      }
    }

    if (maxIndex === -1) break;

    const keepCount = Math.max(
      1,
      Math.floor(trimmed[maxIndex].nodes.length / 2),
    );
    trimmed[maxIndex].nodes = trimmed[maxIndex].nodes.slice(0, keepCount);
  }

  serialized = JSON.stringify(trimmed);
  return { serialized, truncated: true };
}
