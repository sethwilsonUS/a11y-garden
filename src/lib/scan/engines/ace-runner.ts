import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "playwright";
import type { DOMWindow } from "jsdom";
import {
  computeFindingDedupKey,
  getPrimarySelector,
  inferHeuristicImpact,
  normalizeWcagCriterion,
  type AuditFinding,
  type FindingDisposition,
  type FindingImpact,
} from "@/lib/findings";
import { getAceSource } from "./source-cache";

interface AceRawResult {
  ruleId: string;
  reasonId?: string;
  value?: string[];
  message?: string;
  snippet?: string;
  path?: { dom?: string };
}

interface AceRuleMetadata {
  groupMessage?: string;
  helpUrl?: string;
  wcagCriteria: string[];
}

const aceMetadataCache = new Map<string, AceRuleMetadata>();

function xpathToCssSelector(xpath?: string): string {
  if (!xpath) return "document";

  const segments = xpath
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const match = segment.match(/^([a-zA-Z0-9_-]+)(?:\[(\d+)\])?$/);
      if (!match) return "";
      const tag = match[1].toLowerCase();
      const index = match[2];
      return index ? `${tag}:nth-of-type(${index})` : tag;
    })
    .filter(Boolean);

  return segments.join(" > ") || "document";
}

function loadAceRuleMetadata(ruleId: string): AceRuleMetadata {
  const cached = aceMetadataCache.get(ruleId);
  if (cached) return cached;

  const filePath = resolve(
    process.cwd(),
    "node_modules/accessibility-checker-engine/help/en-US",
    `${ruleId}.html`,
  );

  if (!existsSync(filePath)) {
    const metadata = { wcagCriteria: [] };
    aceMetadataCache.set(ruleId, metadata);
    return metadata;
  }

  const source = readFileSync(filePath, "utf8");
  const messagesMatch = source.match(/RULE_MESSAGES\s*=\s*(\{[\s\S]*?\});/);
  let groupMessage: string | undefined;

  if (messagesMatch) {
    try {
      const parsed = JSON.parse(messagesMatch[1]) as Record<
        string,
        Record<string, string>
      >;
      groupMessage = parsed["en-US"]?.group;
    } catch {
      // Ignore malformed metadata; the runtime message is still usable.
    }
  }

  const criteria = new Set<string>();
  for (const match of source.matchAll(/requirements\/#(\d+_\d+_\d+)/g)) {
    const criterion = normalizeWcagCriterion(match[1]);
    if (criterion) criteria.add(criterion);
  }

  const firstCriterion = [...criteria][0];
  const metadata: AceRuleMetadata = {
    ...(groupMessage ? { groupMessage } : {}),
    ...(firstCriterion
      ? {
          helpUrl: `https://www.ibm.com/able/requirements/requirements/#${firstCriterion.replace(/\./g, "_")}`,
        }
      : {}),
    wcagCriteria: [...criteria].sort(),
  };

  aceMetadataCache.set(ruleId, metadata);
  return metadata;
}

function aceDispositionFromValue(value: string[] | undefined): FindingDisposition | null {
  const kind = value?.[0];
  const outcome = value?.[1];

  if (outcome === "PASS") return null;
  if (kind === "VIOLATION" && outcome === "FAIL") return "confirmed";
  return "needs-review";
}

function softenImpactByOneLevel(impact: FindingImpact): FindingImpact {
  if (impact === "serious") return "moderate";
  if (impact === "moderate") return "minor";
  return "minor";
}

function inferAceImpact(
  result: AceRawResult,
  wcagCriteria: string[],
  disposition: FindingDisposition,
): FindingImpact {
  const base = inferHeuristicImpact(result.ruleId, wcagCriteria, disposition);
  if (disposition !== "needs-review") return base;

  const policy = result.value?.[0];
  if (policy && policy !== "VIOLATION") {
    return softenImpactByOneLevel(base);
  }

  return base;
}

function normalizeAceResults(results: AceRawResult[]): AuditFinding[] {
  const grouped = new Map<string, AuditFinding>();

  for (const result of results) {
    const disposition = aceDispositionFromValue(result.value);
    if (!disposition) continue;

    const metadata = loadAceRuleMetadata(result.ruleId);
    const engineRuleId = result.reasonId
      ? `${result.ruleId}#${result.reasonId}`
      : result.ruleId;
    const key = `${disposition}:${engineRuleId}`;
    const selector = xpathToCssSelector(result.path?.dom);
    const existing = grouped.get(key);

    if (existing) {
      existing.nodes.push({
        selector,
        ...(result.snippet ? { html: result.snippet } : {}),
        ...(result.path?.dom ? { xpath: result.path.dom } : {}),
      });
      continue;
    }

    const finding: AuditFinding = {
      id: result.ruleId,
      dedupKey: "",
      engines: ["ace"],
      engineRuleIds: { ace: [engineRuleId] },
      disposition,
      impact: inferAceImpact(result, metadata.wcagCriteria, disposition),
      help: metadata.groupMessage ?? result.message ?? result.ruleId,
      description: result.message ?? metadata.groupMessage ?? result.ruleId,
      ...(metadata.helpUrl ? { helpUrl: metadata.helpUrl } : {}),
      wcagCriteria: [...metadata.wcagCriteria],
      wcagTags: [],
      nodes: [
        {
          selector,
          ...(result.snippet ? { html: result.snippet } : {}),
          ...(result.path?.dom ? { xpath: result.path.dom } : {}),
        },
      ],
    };

    grouped.set(key, finding);
  }

  return [...grouped.values()].map((finding) => ({
    ...finding,
    dedupKey: computeFindingDedupKey(
      finding.disposition,
      getPrimarySelector(finding),
      finding.wcagCriteria,
      finding.id,
    ),
  }));
}

function aceEvaluator() {
  return async (source: string) => {
    if (!(window as unknown as Record<string, unknown>).ace) {
      window.eval(source);
    }

    const checker = new (
      (window as unknown as Record<string, unknown>).ace as {
        Checker: new () => { check(doc: Document, rulesets: string[]): Promise<{ results?: AceRawResult[]; report?: { results?: AceRawResult[] } }> };
      }
    ).Checker();

    const report = await checker.check(document, ["WCAG_2_2"]);
    return report.results ?? report.report?.results ?? [];
  };
}

export async function runAceOnPage(
  page: Page,
): Promise<AuditFinding[]> {
  const source = getAceSource();
  const results = await page.evaluate(aceEvaluator(), source);
  return normalizeAceResults(results);
}

export async function runAceOnDom(
  window: DOMWindow,
): Promise<AuditFinding[]> {
  if (!(window as unknown as Record<string, unknown>).ace) {
    window.eval(getAceSource());
  }

  const checker = new (
    (window as unknown as Record<string, unknown>).ace as {
      Checker: new () => {
        check(
          doc: Document,
          rulesets: string[],
        ): Promise<{ results?: AceRawResult[]; report?: { results?: AceRawResult[] } }>;
      };
    }
  ).Checker();

  const report = await checker.check(window.document, ["WCAG_2_2"]);
  return normalizeAceResults(report.results ?? report.report?.results ?? []);
}
