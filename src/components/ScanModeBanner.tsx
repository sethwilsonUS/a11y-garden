"use client";

import { useState } from "react";

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

interface ScanModeBannerProps {
  scanMode?: "full" | "safe" | "jsdom-structural";
  scanModeDetail?: string;
  viewport: "desktop" | "mobile";
  totalViolations?: number;
}

function parseScanModeDetail(raw?: string): ScanModeInfo | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ScanModeInfo;
  } catch {
    return null;
  }
}

function ShieldIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      className={`${className ?? "w-3.5 h-3.5"} transition-transform duration-200 ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function FullScanBanner({ detail }: { detail: ScanModeInfo | null }) {
  const rulesRun = detail?.rulesRun ?? 0;
  return (
    <div
      className="rounded-xl p-4 flex items-start gap-3 border"
      style={{ backgroundColor: "var(--accent-bg)", borderColor: "var(--accent-border)" }}
      role="note"
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "var(--accent-bg)" }}>
        <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-1 text-accent">Complete Scan</h3>
        <p className="text-sm text-theme-secondary">
          All {rulesRun > 0 ? rulesRun : ""} accessibility rules checked.
        </p>
      </div>
    </div>
  );
}

function SafeModeBanner({ detail, viewport }: { detail: ScanModeInfo | null; viewport: string }) {
  const [expanded, setExpanded] = useState(false);
  const rulesRun = detail?.rulesRun ?? 0;
  const skipped = detail?.skippedCategories ?? [];
  const skippedRuleCount = skipped.reduce((sum, c) => sum + c.ruleIds.length, 0);
  const totalRules = rulesRun + skippedRuleCount;

  return (
    <div
      className="rounded-xl p-4 flex items-start gap-3 border"
      style={{ backgroundColor: "var(--severity-moderate-bg)", borderColor: "var(--severity-moderate-border)" }}
      role="note"
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "var(--severity-moderate-bg)" }}>
        <ShieldIcon className="w-4 h-4" style={{ color: "var(--severity-moderate)" }} />
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--severity-moderate)" }}>Partial Scan</h3>
        <p className="text-sm text-theme-secondary">
          {totalRules > 0
            ? `${rulesRun} of ${totalRules} rules checked at the ${viewport} viewport. ${skippedRuleCount} rules skipped due to site complexity.`
            : `The ${viewport} scan ran in safe mode. Not all checks were performed.`}
        </p>

        {skipped.length > 0 && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium cursor-pointer hover:underline transition-colors"
              style={{ color: "var(--severity-moderate)" }}
              aria-expanded={expanded}
            >
              <ChevronIcon open={expanded} />
              {expanded ? "Hide" : "Show"} skipped categories
            </button>
            {expanded && (
              <ul className="mt-3 space-y-2">
                {skipped.map((cat) => (
                  <li key={cat.name} className="text-sm">
                    <span className="font-medium text-theme-primary">{cat.name}</span>
                    <span className="text-theme-muted"> — {cat.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StructuralScanBanner({ detail, totalViolations }: { detail: ScanModeInfo | null; totalViolations?: number }) {
  const [expanded, setExpanded] = useState(false);
  const rulesRun = detail?.rulesRun ?? 0;
  const skipped = detail?.skippedCategories ?? [];
  const skippedRuleCount = skipped.reduce((sum, c) => sum + c.ruleIds.length, 0);
  const totalRules = rulesRun + skippedRuleCount;

  return (
    <div
      className="rounded-xl p-4 flex items-start gap-3 border"
      style={{ backgroundColor: "var(--severity-moderate-bg)", borderColor: "var(--severity-moderate-border)" }}
      role="note"
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "var(--severity-moderate-bg)" }}>
        <ShieldIcon className="w-4 h-4" style={{ color: "var(--severity-moderate)" }} />
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--severity-moderate)" }}>Structural Scan</h3>
        <p className="text-sm text-theme-secondary">
          {totalRules > 0
            ? `This site\u2019s firewall required server-side analysis. ${rulesRun} of ${totalRules} rules checked.`
            : "This site\u2019s firewall required server-side analysis. Some rules could not be checked."}
        </p>

        {skipped.length > 0 && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium cursor-pointer hover:underline transition-colors"
              style={{ color: "var(--severity-moderate)" }}
              aria-expanded={expanded}
            >
              <ChevronIcon open={expanded} />
              {expanded ? "Hide" : "Show"} skipped categories
            </button>
            {expanded && (
              <ul className="mt-3 space-y-2">
                {skipped.map((cat) => (
                  <li key={cat.name} className="text-sm">
                    <span className="font-medium text-theme-primary">{cat.name}</span>
                    <span className="text-theme-muted"> — {cat.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {totalViolations === 0 && (
          <p className="mt-3 text-sm text-theme-secondary font-medium">
            Limited results — this site likely renders content via JavaScript. The server-side scan could only check the page skeleton.
          </p>
        )}

        <p className="mt-3 text-xs text-theme-muted">
          For a complete scan including color contrast, try running A11y Garden locally against this URL.
        </p>
      </div>
    </div>
  );
}

export function ScanModeBanner({ scanMode, scanModeDetail, viewport, totalViolations }: ScanModeBannerProps) {
  if (!scanMode || scanMode === "full") {
    const detail = parseScanModeDetail(scanModeDetail);
    if (!detail || detail.rulesRun === 0) return null;
    return <FullScanBanner detail={detail} />;
  }

  const detail = parseScanModeDetail(scanModeDetail);

  if (scanMode === "jsdom-structural") {
    return <StructuralScanBanner detail={detail} totalViolations={totalViolations} />;
  }

  return <SafeModeBanner detail={detail} viewport={viewport} />;
}
