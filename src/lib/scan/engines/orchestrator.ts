import type { Page } from "playwright";
import { JSDOM } from "jsdom";
import {
  FINDINGS_VERSION,
  summarizeFindings,
  truncateFindings,
  type AuditFinding,
  type EngineExecutionSummary,
  type EngineProfile,
  type EngineSummary,
  type ViolationCounts,
} from "@/lib/findings";
import type { ScanModeInfo } from "../strategies/types";
import { deduplicateFindings } from "./dedup";
import { runAceOnPage } from "./ace-runner";
import { runAxeOnDom, runAxeOnPage } from "./axe-runner";
import { runHtmlcsOnPage } from "./htmlcs-runner";

export interface OrchestratedScanResult {
  findings: AuditFinding[];
  violations: ViolationCounts;
  reviewViolations: ViolationCounts;
  rawFindings: string;
  findingsVersion: typeof FINDINGS_VERSION;
  engineProfile: EngineProfile;
  engineSummary: EngineSummary;
  scanModeInfo: ScanModeInfo;
  warning?: string;
  truncated: boolean;
}

const PROFILE_ENGINES: Record<EngineProfile, Array<"axe" | "htmlcs" | "ace">> = {
  strict: ["axe"],
  comprehensive: ["axe", "htmlcs", "ace"],
};

function emptyScanModeInfo(): ScanModeInfo {
  return { mode: "full", rulesRun: 0, skippedCategories: [] };
}

function buildFailureSummary(
  engine: "axe" | "htmlcs" | "ace",
  durationMs: number,
  error: unknown,
): EngineExecutionSummary {
  return {
    engine,
    status: "failed",
    durationMs,
    confirmedCount: 0,
    reviewCount: 0,
    note: error instanceof Error ? error.message : "Unknown engine error",
  };
}

function buildCompletedSummary(
  engine: "axe" | "htmlcs" | "ace",
  findings: AuditFinding[],
  durationMs: number,
  note?: string,
): EngineExecutionSummary {
  const { confirmed, review } = summarizeFindings(findings);
  return {
    engine,
    status: "completed",
    durationMs,
    confirmedCount: confirmed.total,
    reviewCount: review.total,
    ...(note ? { note } : {}),
  };
}

function buildSkippedSummary(
  engine: "axe" | "htmlcs" | "ace",
  note: string,
): EngineExecutionSummary {
  return {
    engine,
    status: "skipped",
    durationMs: 0,
    confirmedCount: 0,
    reviewCount: 0,
    note,
  };
}

function finalizeScan(
  findings: AuditFinding[],
  engineProfile: EngineProfile,
  engineSummaries: EngineExecutionSummary[],
  scanModeInfo: ScanModeInfo,
  warning?: string,
): OrchestratedScanResult {
  const deduplicated = deduplicateFindings(findings);
  const { confirmed, review } = summarizeFindings(deduplicated);
  const { serialized, truncated } = truncateFindings(deduplicated);

  return {
    findings: deduplicated,
    violations: confirmed,
    reviewViolations: review,
    rawFindings: serialized,
    findingsVersion: FINDINGS_VERSION,
    engineProfile,
    engineSummary: {
      selectedEngines: PROFILE_ENGINES[engineProfile],
      engines: engineSummaries,
    },
    scanModeInfo,
    ...(warning ? { warning } : {}),
    truncated,
  };
}

export async function runEnginesOnPage(
  page: Page,
  engineProfile: EngineProfile,
): Promise<OrchestratedScanResult> {
  const selectedEngines = PROFILE_ENGINES[engineProfile];
  const findings: AuditFinding[] = [];
  const summaries: EngineExecutionSummary[] = [];
  let scanModeInfo = emptyScanModeInfo();
  let warning: string | undefined;

  const axeStart = Date.now();
  try {
    const axeResult = await runAxeOnPage(page);
    findings.push(...axeResult.findings);
    scanModeInfo = axeResult.scanModeInfo;
    warning = axeResult.warning;
    summaries.push(
      buildCompletedSummary(
        "axe",
        axeResult.findings,
        Date.now() - axeStart,
        axeResult.scanModeInfo.reason,
      ),
    );
  } catch (error) {
    summaries.push(buildFailureSummary("axe", Date.now() - axeStart, error));
  }

  if (selectedEngines.includes("htmlcs")) {
    const htmlcsStart = Date.now();
    try {
      const htmlcsFindings = await runHtmlcsOnPage(page);
      findings.push(...htmlcsFindings);
      summaries.push(
        buildCompletedSummary(
          "htmlcs",
          htmlcsFindings,
          Date.now() - htmlcsStart,
        ),
      );
    } catch (error) {
      summaries.push(
        buildFailureSummary("htmlcs", Date.now() - htmlcsStart, error),
      );
    }
  }

  if (selectedEngines.includes("ace")) {
    const aceStart = Date.now();
    try {
      const aceFindings = await runAceOnPage(page);
      findings.push(...aceFindings);
      summaries.push(
        buildCompletedSummary("ace", aceFindings, Date.now() - aceStart),
      );
    } catch (error) {
      summaries.push(buildFailureSummary("ace", Date.now() - aceStart, error));
    }
  }

  if (findings.length === 0 && summaries.every((summary) => summary.status === "failed")) {
    throw new Error("All accessibility engines failed");
  }

  return finalizeScan(findings, engineProfile, summaries, scanModeInfo, warning);
}

export async function runEnginesOnHtml(
  html: string,
  url: string,
  engineProfile: EngineProfile,
  ruleIds?: readonly string[],
): Promise<OrchestratedScanResult> {
  const selectedEngines = PROFILE_ENGINES[engineProfile];
  const summaries: EngineExecutionSummary[] = [];
  const findings: AuditFinding[] = [];
  let scanModeInfo = emptyScanModeInfo();
  const dom = new JSDOM(html, {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const jsdomSkipNote =
    "Skipped in server-side structural mode because JSDOM lacks reliable CSS, layout, and pseudo-element APIs.";

  try {
    const axeStart = Date.now();
    try {
      const axeResult = await runAxeOnDom(dom.window, ruleIds);
      findings.push(...axeResult.findings);
      scanModeInfo = axeResult.scanModeInfo;
      summaries.push(
        buildCompletedSummary(
          "axe",
          axeResult.findings,
          Date.now() - axeStart,
          "Server-side structural scan",
        ),
      );
    } catch (error) {
      summaries.push(buildFailureSummary("axe", Date.now() - axeStart, error));
    }

    if (selectedEngines.includes("htmlcs")) {
      summaries.push(buildSkippedSummary("htmlcs", jsdomSkipNote));
    }

    if (selectedEngines.includes("ace")) {
      summaries.push(buildSkippedSummary("ace", jsdomSkipNote));
    }

    if (findings.length === 0 && summaries.every((summary) => summary.status === "failed")) {
      throw new Error("All accessibility engines failed");
    }

    return finalizeScan(
      findings,
      engineProfile,
      summaries,
      scanModeInfo,
    );
  } finally {
    dom.window.close();
  }
}
