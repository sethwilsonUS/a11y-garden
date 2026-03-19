"use client";

import { useId, useMemo, useState, type CSSProperties } from "react";
import type { EngineSummary } from "@/lib/findings";

interface SkippedCategory {
  name: string;
  reason: string;
  ruleIds: string[];
}

interface ScanModeInfo {
  mode: "full" | "safe-rules" | "jsdom-structural";
  reason?: string;
  rulesRun: number;
  skippedCategories: SkippedCategory[];
}

interface CoverageSummary {
  title: string;
  description: string;
  tone: "accent" | "moderate" | "neutral";
  skippedCategories: SkippedCategory[];
  limitedResultsNote?: string;
  footer?: string;
}

interface EngineSummaryAccordionProps {
  engineProfile?: string;
  engineSummary?: EngineSummary | string;
  scanMode?: "full" | "safe" | "jsdom-structural";
  scanModeDetail?: string;
  viewport?: "desktop" | "mobile";
  totalViolations?: number;
  headingLevel?: "h2" | "h3";
}

function formatEngineProfile(profile?: string) {
  if (profile === "comprehensive") return "Comprehensive";
  if (profile === "strict") return "Strict";
  return undefined;
}

function formatEngineName(engine: string) {
  if (engine === "axe") return "axe-core";
  if (engine === "htmlcs") return "HTML_CodeSniffer";
  if (engine === "ace") return "IBM ACE";
  return engine;
}

function parseEngineSummary(
  value?: EngineSummary | string,
): EngineSummary | undefined {
  if (!value) return undefined;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as EngineSummary;
  } catch {
    return undefined;
  }
}

function parseScanModeDetail(raw?: string): ScanModeInfo | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as ScanModeInfo;
  } catch {
    return undefined;
  }
}

function buildCoverageSummary({
  scanMode,
  detail,
  viewport,
  totalViolations,
}: {
  scanMode?: "full" | "safe" | "jsdom-structural";
  detail?: ScanModeInfo;
  viewport?: "desktop" | "mobile";
  totalViolations?: number;
}): CoverageSummary | undefined {
  if (!scanMode && !detail) return undefined;

  const viewportLabel = viewport ? `${viewport} viewport` : "requested viewport";
  const rulesRun = detail?.rulesRun ?? 0;
  const skippedCategories = detail?.skippedCategories ?? [];
  const skippedRuleCount = skippedCategories.reduce(
    (sum, category) => sum + category.ruleIds.length,
    0,
  );
  const totalRules = rulesRun + skippedRuleCount;

  if (!scanMode || scanMode === "full") {
    return {
      title: "Full axe-core coverage",
      description:
        rulesRun > 0
          ? `axe-core completed ${rulesRun} checks at the ${viewportLabel}.`
          : `axe-core ran its standard rule set at the ${viewportLabel}.`,
      tone: "accent",
      skippedCategories: [],
    };
  }

  if (scanMode === "jsdom-structural") {
    return {
      title: "Structural axe-core coverage",
      description:
        totalRules > 0
          ? `This site's firewall required server-side analysis. axe-core completed ${rulesRun} of ${totalRules} structural checks.`
          : "This site's firewall required server-side analysis. Some browser-dependent checks could not run.",
      tone: "moderate",
      skippedCategories,
      limitedResultsNote:
        totalViolations === 0
          ? "Limited results: this page likely needs a live browser to render meaningful content."
          : undefined,
      footer:
        "For the broadest coverage, run a live-browser scan whenever the site allows it.",
    };
  }

  return {
    title: "Partial axe-core coverage",
    description:
      totalRules > 0
        ? `axe-core completed ${rulesRun} of ${totalRules} checks at the ${viewportLabel}. ${skippedRuleCount} axe-core checks were skipped due to site complexity.`
        : `axe-core used a reduced ruleset at the ${viewportLabel}.`,
    tone: "moderate",
    skippedCategories,
  };
}

function toneStyles(tone: CoverageSummary["tone"]): {
  panelStyle?: CSSProperties;
  coverageCardStyle?: CSSProperties;
  iconStyle?: CSSProperties;
  iconTextStyle?: CSSProperties;
  badgeStyle?: CSSProperties;
  haloBackground?: string;
} {
  if (tone === "accent") {
    return {
      panelStyle: {
        background:
          "radial-gradient(circle at 86% 22%, var(--accent-glow) 0%, transparent 28%), linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-secondary) 60%, var(--accent-bg) 100%)",
      },
      coverageCardStyle: {
        background:
          "linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-secondary) 56%, var(--accent-bg) 100%)",
        borderColor: "var(--accent-border)",
      },
      iconStyle: {
        backgroundColor: "var(--bg-primary)",
        borderColor: "var(--accent-border)",
      },
      iconTextStyle: { color: "var(--accent)" },
      badgeStyle: {
        backgroundColor: "var(--bg-primary)",
        borderColor: "var(--accent-border)",
        color: "var(--accent)",
      },
      haloBackground:
        "radial-gradient(circle, var(--accent-glow) 0%, transparent 72%)",
    };
  }

  if (tone === "moderate") {
    return {
      panelStyle: {
        background:
          "radial-gradient(circle at 86% 22%, var(--severity-moderate-bg) 0%, transparent 28%), linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-secondary) 60%, var(--severity-moderate-bg) 100%)",
      },
      coverageCardStyle: {
        background:
          "linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-secondary) 56%, var(--severity-moderate-bg) 100%)",
        borderColor: "var(--severity-moderate-border)",
      },
      iconStyle: {
        backgroundColor: "var(--bg-primary)",
        borderColor: "var(--severity-moderate-border)",
      },
      iconTextStyle: { color: "var(--severity-moderate)" },
      badgeStyle: {
        backgroundColor: "var(--bg-primary)",
        borderColor: "var(--severity-moderate-border)",
        color: "var(--severity-moderate)",
      },
      haloBackground:
        "radial-gradient(circle, var(--severity-moderate-bg) 0%, transparent 72%)",
    };
  }

  return {
    panelStyle: {
      background:
        "linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-secondary) 100%)",
    },
    coverageCardStyle: {
      backgroundColor: "var(--bg-secondary)",
      borderColor: "var(--border-color)",
    },
    iconStyle: {
      backgroundColor: "var(--bg-primary)",
      borderColor: "var(--border-color)",
    },
    iconTextStyle: { color: "var(--text-secondary)" },
    badgeStyle: {
      backgroundColor: "var(--bg-primary)",
      borderColor: "var(--border-color)",
      color: "var(--text-secondary)",
    },
    haloBackground: undefined,
  };
}

function engineStatusStyles(status: "completed" | "failed" | "skipped"): CSSProperties {
  if (status === "completed") {
    return {
      backgroundColor: "var(--accent-bg)",
      borderColor: "var(--accent-border)",
      color: "var(--accent)",
    };
  }
  if (status === "failed") {
    return {
      backgroundColor: "var(--severity-critical-bg)",
      borderColor: "var(--severity-critical-border)",
      color: "var(--severity-critical)",
    };
  }
  return {
    backgroundColor: "var(--severity-moderate-bg)",
    borderColor: "var(--severity-moderate-border)",
    color: "var(--severity-moderate)",
  };
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

export function EngineSummaryAccordion({
  engineProfile,
  engineSummary,
  scanMode,
  scanModeDetail,
  viewport,
  totalViolations,
  headingLevel = "h2",
}: EngineSummaryAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const parsed = useMemo(() => parseEngineSummary(engineSummary), [engineSummary]);
  const coverage = useMemo(
    () =>
      buildCoverageSummary({
        scanMode,
        detail: parseScanModeDetail(scanModeDetail),
        viewport,
        totalViolations,
      }),
    [scanMode, scanModeDetail, viewport, totalViolations],
  );
  const profileLabel = formatEngineProfile(engineProfile);
  const engineCount = parsed?.selectedEngines?.length ?? parsed?.engines?.length ?? 0;
  const failedCount =
    parsed?.engines?.filter((engine) => engine.status === "failed").length ?? 0;
  const skippedCount =
    parsed?.engines?.filter((engine) => engine.status === "skipped").length ?? 0;
  const selectedLabels = parsed?.selectedEngines?.map(formatEngineName).join(", ");
  const HeadingTag = headingLevel;
  const DetailHeadingTag = headingLevel === "h2" ? "h3" : "h4";
  const tone = coverage?.tone ?? (failedCount > 0 || skippedCount > 0 ? "moderate" : "neutral");
  const styles = toneStyles(tone);
  const headerBadges = [
    profileLabel ? `${profileLabel} profile` : undefined,
    coverage?.title,
    engineCount > 0 ? `${engineCount} ${engineCount === 1 ? "engine" : "engines"}` : undefined,
    failedCount > 0
      ? `${failedCount} failed`
      : skippedCount > 0
        ? `${skippedCount} skipped`
        : undefined,
  ].filter(Boolean) as string[];
  const headerSummary =
    coverage?.description ??
    (selectedLabels
      ? `Selected engines: ${selectedLabels}.`
      : engineCount > 0
        ? `Expand for the per-engine execution breakdown.`
        : "Expand for scan execution details.");

  if (!profileLabel && !parsed && !coverage) return null;

  return (
    <section className="garden-bed overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="relative w-full overflow-hidden text-left transition-colors cursor-pointer"
        style={styles.panelStyle}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        {styles.haloBackground ? (
          <div
            className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full opacity-90 blur-2xl"
            style={{ background: styles.haloBackground }}
            aria-hidden="true"
          />
        ) : null}
        <div className="relative px-5 py-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div
              className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border shadow-sm"
              style={styles.iconStyle}
            >
              <span style={styles.iconTextStyle}>
                {tone === "accent" ? (
                  <CheckIcon className="h-5 w-5" />
                ) : (
                  <ShieldIcon className="h-5 w-5" />
                )}
              </span>
            </div>
            <div className="min-w-0">
              <HeadingTag className="text-lg font-display font-semibold text-theme-primary">
                Scan Coverage &amp; Engines
              </HeadingTag>
              {headerBadges.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {headerBadges.map((badge) => (
                    <span
                      key={badge}
                      className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium"
                      style={styles.badgeStyle}
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-3 max-w-3xl text-sm text-theme-secondary">
                {headerSummary}
              </p>
            </div>
          </div>
          <svg
            className={`mt-1 h-5 w-5 flex-shrink-0 text-theme-secondary transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div id={panelId} className="border-t border-theme bg-theme-primary px-5 py-5 space-y-5">
          {coverage && (
            <div
              className="rounded-2xl border px-4 py-4"
              style={styles.coverageCardStyle}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border"
                  style={styles.iconStyle}
                >
                  <span style={styles.iconTextStyle}>
                    {tone === "accent" ? (
                      <CheckIcon className="h-4 w-4" />
                    ) : (
                      <ShieldIcon className="h-4 w-4" />
                    )}
                  </span>
                </div>
                <div className="min-w-0">
                  <p
                    className="text-sm font-semibold"
                    style={styles.iconTextStyle}
                  >
                    {coverage.title}
                  </p>
                  <p className="mt-1 text-sm text-theme-secondary">
                    {coverage.description}
                  </p>
                  {coverage.footer && (
                    <p className="mt-2 text-xs text-theme-muted">
                      {coverage.footer}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {coverage?.skippedCategories.length ? (
            <div className="rounded-2xl border border-theme bg-theme-secondary px-4 py-4">
              <DetailHeadingTag className="text-sm font-display font-semibold text-theme-primary">
                Skipped axe-core categories
              </DetailHeadingTag>
              <ul className="mt-3 space-y-2">
                {coverage.skippedCategories.map((category) => (
                  <li key={category.name} className="text-sm text-theme-secondary">
                    <span className="font-medium text-theme-primary">{category.name}</span>
                    <span className="text-theme-muted"> — {category.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {coverage?.limitedResultsNote ? (
            <div
              className="rounded-2xl border px-4 py-4"
              style={{
                backgroundColor: "var(--severity-minor-bg)",
                borderColor: "var(--severity-minor-border)",
              }}
            >
              <p
                className="text-sm font-medium"
                style={{ color: "var(--severity-minor)" }}
              >
                {coverage.limitedResultsNote}
              </p>
            </div>
          ) : null}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DetailHeadingTag className="text-base font-display font-semibold text-theme-primary">
                Engine Breakdown
              </DetailHeadingTag>
              {selectedLabels && (
                <p className="text-xs text-theme-muted">
                  Selected: {selectedLabels}
                </p>
              )}
            </div>

            {parsed?.engines?.length ? (
              <div className="mt-3 space-y-3">
                {parsed.engines.map((engine) => (
                  <div
                    key={engine.engine}
                    className="rounded-xl border border-theme bg-theme-secondary px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-theme-primary">
                          {formatEngineName(engine.engine)}
                        </p>
                        <p className="mt-1 text-sm text-theme-secondary">
                          {engine.confirmedCount} confirmed, {engine.reviewCount} needs review
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize"
                          style={engineStatusStyles(engine.status)}
                        >
                          {engine.status}
                        </span>
                        <span className="text-xs text-theme-muted">
                          {engine.durationMs} ms
                        </span>
                      </div>
                    </div>
                    {engine.note && (
                      <p className="mt-2 text-sm text-theme-muted">
                        {engine.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-theme-muted">
                Engine execution details are not available for this audit.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
