/**
 * Server-side axe-core runner using JSDOM.
 *
 * Used by the BQL strategy for WAF-bypassed sites where we can't run
 * axe in-browser. BQL fetches the rendered HTML, and this module runs
 * axe-core against a JSDOM DOM tree.
 *
 * Trade-off: JSDOM doesn't compute CSS or execute page JS, so:
 * - Rules requiring computed styles (e.g. color-contrast) cannot run
 * - SPA shells with client-rendered content produce minimal results
 * - Results are flagged as "structural scan" with skipped-rule reporting
 */

import { JSDOM } from "jsdom";
import axe from "axe-core";
import type { ViolationCounts, AxeViolationRaw } from "@/lib/scanner";
import { truncateViolations } from "@/lib/scanner";
import { STRUCTURAL_RULES } from "./rules/categories";

export interface AxeJsdomResult {
  violations: ViolationCounts;
  rawViolations: string;
  truncated: boolean;
  rulesRun: number;
  axeTimeMs: number;
}

/**
 * Run axe-core on an HTML string using JSDOM with structural rules only.
 *
 * JSDOM config:
 * - `runScripts: "outside-only"` prevents page scripts from crashing JSDOM
 *   while still allowing us to inject axe-core via window.eval()
 * - `pretendToBeVisual: true` enables requestAnimationFrame (axe uses it)
 */
export async function runAxeOnHtml(
  html: string,
  url: string,
  ruleIds: readonly string[] = STRUCTURAL_RULES,
): Promise<AxeJsdomResult> {
  const start = Date.now();

  const dom = new JSDOM(html, {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });

  try {
    const window = dom.window;

    // Inject axe-core via eval
    window.eval(axe.source);

    const axeInstance = (window as unknown as Record<string, unknown>)
      .axe as typeof axe | undefined;
    if (!axeInstance) {
      throw new Error("axe-core failed to initialize in JSDOM");
    }

    axeInstance.reset();
    const results = await axeInstance.run(window.document.body, {
      runOnly: { type: "rule", values: [...ruleIds] },
      resultTypes: ["violations"],
    });

    const violations: ViolationCounts = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
      total: results.violations.length,
    };

    for (const v of results.violations) {
      const impact = v.impact ?? "minor";
      if (impact === "critical") violations.critical++;
      else if (impact === "serious") violations.serious++;
      else if (impact === "moderate") violations.moderate++;
      else violations.minor++;
    }

    const { serialized: rawViolations, truncated } = truncateViolations(
      results.violations as unknown as AxeViolationRaw[],
    );

    const rulesRun =
      results.violations.length + (results.passes?.length ?? 0);

    return {
      violations,
      rawViolations,
      truncated,
      rulesRun,
      axeTimeMs: Date.now() - start,
    };
  } finally {
    dom.window.close();
  }
}
