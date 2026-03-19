import { describe, expect, it } from "vitest";
import {
  MAX_RAW_FINDINGS_CHARS,
  getFindingNodeCount,
  truncateFindings,
  type AuditFinding,
} from "./findings";

function makeFinding(overrides: {
  id: string;
  nodeCount: number;
  selectorPrefix?: string;
  htmlSize?: number;
  summarySize?: number;
  includeVerboseFields?: boolean;
}): AuditFinding {
  const selectorPrefix = overrides.selectorPrefix ?? overrides.id;
  const includeVerboseFields = overrides.includeVerboseFields ?? true;
  const htmlChunk = "H".repeat(overrides.htmlSize ?? 1200);
  const summaryChunk = "S".repeat(overrides.summarySize ?? 900);

  return {
    id: overrides.id,
    dedupKey: `confirmed:${selectorPrefix}`,
    engines: ["axe"],
    engineRuleIds: { axe: [overrides.id] },
    disposition: "confirmed",
    impact: "serious",
    help: `Help for ${overrides.id}`,
    description: `Description for ${overrides.id}`,
    helpUrl: `https://example.com/${overrides.id}`,
    wcagCriteria: ["1.1.1"],
    wcagTags: ["wcag111"],
    nodes: Array.from({ length: overrides.nodeCount }, (_, index) => {
      const selector = `.${selectorPrefix}-${index}-${"x".repeat(40)}`;
      return {
        selector,
        target: [selector],
        ...(includeVerboseFields
          ? {
              html: `<div data-node="${index}">${htmlChunk}</div>`,
              failureSummary: `Fix this issue ${index}: ${summaryChunk}`,
              xpath: `/html/body/div[${index + 1}]/${"x".repeat(80)}`,
            }
          : {}),
      };
    }),
  };
}

describe("truncateFindings", () => {
  it("returns small payloads unchanged", () => {
    const findings = [makeFinding({ id: "image-alt", nodeCount: 2, htmlSize: 20, summarySize: 20 })];

    const result = truncateFindings(findings);

    expect(result.truncated).toBe(false);
    expect(result.serialized).toBe(JSON.stringify(findings));
  });

  it("trims verbose tail-node details before dropping representative nodes", () => {
    const findings = [
      makeFinding({
        id: "color-contrast",
        nodeCount: 180,
        htmlSize: 1800,
        summarySize: 1200,
      }),
    ];

    const result = truncateFindings(findings);
    const parsed = JSON.parse(result.serialized) as AuditFinding[];

    expect(result.truncated).toBe(true);
    expect(result.serialized.length).toBeLessThanOrEqual(MAX_RAW_FINDINGS_CHARS);
    expect(parsed[0].nodes).toHaveLength(180);
    expect(parsed[0].totalNodes).toBeUndefined();
    expect(parsed[0].nodes[0].html).toBeDefined();
    expect(parsed[0].nodes[30].html).toBeUndefined();
    expect(parsed[0].nodes[30].failureSummary).toBeUndefined();
    expect(parsed[0].nodes[30].xpath).toBeUndefined();
  });

  it("preserves the original affected-element count when node sampling is required", () => {
    const findings = [
      makeFinding({
        id: "heading-order",
        nodeCount: 5000,
        includeVerboseFields: false,
      }),
    ];

    const result = truncateFindings(findings);
    const parsed = JSON.parse(result.serialized) as AuditFinding[];

    expect(result.truncated).toBe(true);
    expect(result.serialized.length).toBeLessThanOrEqual(MAX_RAW_FINDINGS_CHARS);
    expect(parsed[0].nodes.length).toBeGreaterThan(0);
    expect(parsed[0].nodes.length).toBeLessThan(5000);
    expect(parsed[0].totalNodes).toBe(5000);
    expect(getFindingNodeCount(parsed[0])).toBe(5000);
  });

  it("does not mutate the input findings", () => {
    const findings = [
      makeFinding({
        id: "link-name",
        nodeCount: 220,
        htmlSize: 1600,
        summarySize: 1000,
      }),
    ];
    const original = structuredClone(findings);

    truncateFindings(findings);

    expect(findings).toEqual(original);
  });
});
