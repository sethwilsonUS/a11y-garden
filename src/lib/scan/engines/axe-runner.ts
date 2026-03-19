import type { Page } from "playwright";
import type { DOMWindow } from "jsdom";
import {
  computeFindingDedupKey,
  extractWcagCriteriaFromAxeTags,
  getPrimarySelector,
  normalizeLegacyAxeViolations,
  type AuditFinding,
  type AxeViolationRaw,
} from "@/lib/findings";
import type { ScanModeInfo } from "../strategies/types";
import { SAFE_MODE_SKIPPED_CATEGORIES, STRUCTURAL_RULES } from "../rules/categories";
import { getAxeCoreSource } from "./source-cache";

const SAFE_RULES = [
  "image-alt",
  "image-redundant-alt",
  "input-image-alt",
  "area-alt",
  "label",
  "form-field-multiple-labels",
  "select-name",
  "input-button-name",
  "link-name",
  "button-name",
  "document-title",
  "html-has-lang",
  "html-lang-valid",
  "valid-lang",
  "page-has-heading-one",
  "bypass",
  "td-headers-attr",
  "th-has-data-cells",
  "table-fake-caption",
  "landmark-one-main",
  "region",
  "heading-order",
  "empty-heading",
  "duplicate-id",
  "duplicate-id-active",
  "duplicate-id-aria",
  "aria-allowed-attr",
  "aria-hidden-body",
  "aria-hidden-focus",
  "aria-required-attr",
  "aria-required-children",
  "aria-required-parent",
  "aria-roles",
  "aria-valid-attr",
  "aria-valid-attr-value",
  "tabindex",
  "focus-order-semantics",
  "video-caption",
  "audio-caption",
  "meta-viewport",
  "meta-refresh",
  "blink",
  "marquee",
  "server-side-image-map",
] as const;

function buildFullScanMode(rulesRun: number): ScanModeInfo {
  return { mode: "full", rulesRun, skippedCategories: [] };
}

function buildSafeRulesScanMode(
  rulesRun: number,
  errorMessage: string,
): ScanModeInfo {
  return {
    mode: "safe-rules",
    reason: `Full scan failed: ${errorMessage}. Fell back to safe rule subset.`,
    rulesRun,
    skippedCategories: SAFE_MODE_SKIPPED_CATEGORIES.map((category) => ({
      name: category.name,
      reason: category.reason,
      ruleIds: [...category.ruleIds],
    })),
  };
}

export interface AxeRunnerResult {
  findings: AuditFinding[];
  legacyViolations: AxeViolationRaw[];
  scanModeInfo: ScanModeInfo;
  warning?: string;
  rulesRun: number;
}

interface AxeEvaluateResult {
  violations: AxeViolationRaw[];
  passes?: unknown[];
  _warning?: string;
}

export async function runAxeOnPage(
  page: Page,
): Promise<AxeRunnerResult> {
  const axeSource = await getAxeCoreSource();
  await page.evaluate(axeSource);

  let results: AxeEvaluateResult;
  let usedSafeMode = false;
  let fullScanError = "";

  const fullScan = await page
    .evaluate(async () => {
      // @ts-expect-error injected at runtime
      const axe = window.axe;
      axe.reset();
      return await axe.run(document.body, {
        resultTypes: ["violations"],
        elementRef: false,
      });
    })
    .catch((error: Error) => ({ error: error.message }));

  if ("error" in fullScan && fullScan.error) {
    fullScanError = fullScan.error;
    results = await page
      .evaluate(async (rules: string[]) => {
        // @ts-expect-error injected at runtime
        const axe = window.axe;
        axe.reset();
        try {
          return await axe.run(document.body, {
            runOnly: { type: "rule", values: rules },
            resultTypes: ["violations"],
            elementRef: false,
          });
        } catch {
          const mainEl =
            document.querySelector("main") ??
            document.querySelector("article") ??
            document.querySelector("#content") ??
            document.querySelector("#main");

          if (mainEl) {
            try {
              return await axe.run(mainEl, {
                runOnly: {
                  type: "rule",
                  values: [
                    "image-alt",
                    "link-name",
                    "button-name",
                    "label",
                    "document-title",
                  ],
                },
                resultTypes: ["violations"],
                elementRef: false,
              });
            } catch {
              // Fall through to the empty warning payload below.
            }
          }

          return {
            violations: [],
            passes: [],
            _warning: "Site too complex for automated scanning",
          };
        }
      }, [...SAFE_RULES])
      .catch((error: Error) => ({
        violations: [],
        passes: [],
        _warning: error.message,
      }));

    usedSafeMode = true;
  } else {
    results = fullScan;
  }

  const violations = results.violations as AxeViolationRaw[];
  const findings = normalizeAxeViolations(violations);
  const rulesRun = violations.length + (results.passes?.length ?? 0);
  const scanModeInfo = usedSafeMode
    ? buildSafeRulesScanMode(rulesRun, fullScanError)
    : buildFullScanMode(rulesRun);

  return {
    findings,
    legacyViolations: violations,
    scanModeInfo,
    ...(results._warning ? { warning: results._warning } : {}),
    rulesRun,
  };
}

export async function runAxeOnDom(
  window: DOMWindow,
  ruleIds: readonly string[] = STRUCTURAL_RULES,
): Promise<AxeRunnerResult> {
  const axeSource = await getAxeCoreSource();
  window.eval(axeSource);

  const axeInstance = (window as unknown as Record<string, unknown>).axe as {
    reset(): void;
    run(
      context: Element,
      options: Record<string, unknown>,
    ): Promise<AxeEvaluateResult>;
  } | undefined;

  if (!axeInstance) {
    throw new Error("axe-core failed to initialize in JSDOM");
  }

  axeInstance.reset();
  const results = await axeInstance.run(window.document.body, {
    runOnly: { type: "rule", values: [...ruleIds] },
    resultTypes: ["violations"],
  });

  const violations = results.violations as AxeViolationRaw[];

  return {
    findings: normalizeAxeViolations(violations),
    legacyViolations: violations,
    scanModeInfo: {
      mode: "jsdom-structural",
      rulesRun: violations.length + (results.passes?.length ?? 0),
      skippedCategories: [],
    },
    rulesRun: violations.length + (results.passes?.length ?? 0),
  };
}

function normalizeAxeViolations(
  violations: AxeViolationRaw[],
): AuditFinding[] {
  return normalizeLegacyAxeViolations(violations).map((finding) => ({
    ...finding,
    dedupKey: computeFindingDedupKey(
      "confirmed",
      getPrimarySelector(finding),
      extractWcagCriteriaFromAxeTags(finding.wcagTags),
      finding.id,
    ),
  }));
}
