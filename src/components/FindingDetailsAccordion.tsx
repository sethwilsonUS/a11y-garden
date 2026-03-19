"use client";

import { useState } from "react";
import {
  getFindingNodeCount,
  parseSerializedFindings,
  type AuditFinding,
  type FindingDisposition,
} from "@/lib/findings";

const severityConfig = {
  critical: { cssVar: "severity-critical", label: "Critical" },
  serious: { cssVar: "severity-serious", label: "Serious" },
  moderate: { cssVar: "severity-moderate", label: "Moderate" },
  minor: { cssVar: "severity-minor", label: "Minor" },
} as const;

interface FindingDetailsAccordionProps {
  idPrefix: string;
  rawFindings?: string;
  rawViolations?: string;
  disposition?: FindingDisposition;
  title?: string;
  description?: string;
}

function getFixInstructions(summary: string | undefined) {
  if (!summary) return null;
  const lines = summary.split("\n").map((line) => line.trim()).filter(Boolean);
  const instructions = lines.filter(
    (line) => !line.match(/^Fix (all|any) of the following:?$/i),
  );
  return instructions.length > 0 ? instructions : null;
}

function getExampleCountNote(
  totalNodeCount: number,
  storedNodeCount: number,
  displayedNodeCount: number,
) {
  if (totalNodeCount > storedNodeCount) {
    if (displayedNodeCount < storedNodeCount) {
      return `Showing ${displayedNodeCount} of ${storedNodeCount} stored representative examples from ${totalNodeCount} affected elements.`;
    }

    return `Showing ${storedNodeCount} representative examples from ${totalNodeCount} affected elements.`;
  }

  if (displayedNodeCount < storedNodeCount) {
    return `Showing ${displayedNodeCount} of ${storedNodeCount} stored examples.`;
  }

  return null;
}

export function FindingDetailsAccordion({
  idPrefix,
  rawFindings,
  rawViolations,
  disposition,
  title,
  description,
}: FindingDetailsAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());

  const findings = parseSerializedFindings(rawFindings, rawViolations).filter(
    (finding) => !disposition || finding.disposition === disposition,
  );

  if (findings.length === 0) return null;

  const severityOrder: Array<keyof typeof severityConfig> = [
    "critical",
    "serious",
    "moderate",
    "minor",
  ];
  const grouped = severityOrder.reduce(
    (acc, severity) => {
      acc[severity] = findings.filter((finding) => finding.impact === severity);
      return acc;
    },
    {} as Record<(typeof severityOrder)[number], AuditFinding[]>,
  );

  const toggleFinding = (key: string) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const heading = title ?? (
    disposition === "needs-review"
      ? "Needs Review"
      : disposition === "confirmed"
        ? "Confirmed Findings"
        : "Detailed Findings"
  );

  return (
    <section className="garden-bed overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between bg-theme-secondary hover:bg-theme-tertiary transition-colors cursor-pointer rounded-t-2xl"
        aria-expanded={isOpen}
        aria-controls={`${idPrefix}-panel`}
      >
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-theme-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <span className="font-display font-semibold text-theme-primary">
            {heading}
          </span>
          <span className="text-sm text-theme-muted">
            ({findings.length} {findings.length === 1 ? "finding" : "findings"})
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-theme-secondary transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div id={`${idPrefix}-panel`} className="p-6 space-y-6 bg-theme-primary border-t border-theme">
          {description && (
            <p className="text-sm text-theme-secondary leading-relaxed">
              {description}
            </p>
          )}

          {severityOrder.map((severity) => {
            const items = grouped[severity];
            if (!items || items.length === 0) return null;
            const config = severityConfig[severity];

            return (
              <div key={severity}>
                <h3
                  className="text-sm font-semibold uppercase tracking-wide mb-3"
                  style={{ color: `var(--${config.cssVar})` }}
                >
                  {config.label} ({items.length})
                </h3>
                <div className="space-y-3">
                  {items.map((finding) => {
                    const expandKey = `${finding.dedupKey}-${finding.id}`;
                    const isExpanded = expandedFindings.has(expandKey);
                    const totalNodeCount = getFindingNodeCount(finding);
                    const storedNodeCount = finding.nodes.length;
                    const criteriaLabel = finding.wcagCriteria.length > 0
                      ? `WCAG ${finding.wcagCriteria.join(", ")}`
                      : null;

                    return (
                      <div
                        key={expandKey}
                        className="rounded-lg border overflow-hidden"
                        style={{
                          backgroundColor: `var(--${config.cssVar}-bg)`,
                          borderColor: `var(--${config.cssVar}-border)`,
                        }}
                      >
                        <button
                          onClick={() => toggleFinding(expandKey)}
                          className="w-full px-4 py-3 flex items-start justify-between text-left cursor-pointer hover:opacity-80 transition-opacity"
                          aria-expanded={isExpanded}
                          aria-controls={`${idPrefix}-${expandKey}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-theme-primary">
                              {finding.help}
                            </p>
                            <p className="text-sm text-theme-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <code className="text-xs bg-theme-tertiary px-1.5 py-0.5 rounded font-mono">
                                {finding.id}
                              </code>
                              <span aria-hidden="true">·</span>
                              <span>
                                {totalNodeCount} {totalNodeCount === 1 ? "element" : "elements"} affected
                              </span>
                              {finding.engines.length > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>Engines: {finding.engines.join(", ")}</span>
                                </>
                              )}
                              {criteriaLabel && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{criteriaLabel}</span>
                                </>
                              )}
                            </p>
                          </div>
                          <svg
                            className={`w-5 h-5 text-theme-muted flex-shrink-0 ml-2 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {isExpanded && (
                          <div id={`${idPrefix}-${expandKey}`} className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: `var(--${config.cssVar}-border)` }}>
                            <p className="text-sm text-theme-secondary pt-3">
                              {finding.description}
                            </p>

                            {finding.helpUrl && (
                              <a
                                href={finding.helpUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-accent hover:underline transition-colors"
                              >
                                Learn how to fix this
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            )}

                            <div>
                              {(() => {
                                const displayedNodeCount = Math.min(storedNodeCount, 10);
                                const exampleCountNote = getExampleCountNote(
                                  totalNodeCount,
                                  storedNodeCount,
                                  displayedNodeCount,
                                );
                                const hiddenElementCount = Math.max(
                                  totalNodeCount - displayedNodeCount,
                                  0,
                                );

                                return (
                                  <>
                                    <p className="text-xs font-semibold text-theme-muted uppercase tracking-wide mb-2">
                                      Affected Elements ({totalNodeCount})
                                    </p>
                                    {exampleCountNote && (
                                      <p className="text-xs text-theme-muted mb-2">
                                        {exampleCountNote}
                                      </p>
                                    )}
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                      {finding.nodes.slice(0, 10).map((node, idx) => {
                                        const fixInstructions = getFixInstructions(node.failureSummary);

                                        return (
                                          <div key={idx} className="bg-theme-tertiary rounded-lg p-3">
                                            {node.selector && (
                                              <p className="text-xs text-theme-muted mb-2 font-mono break-all">
                                                {node.selector}
                                              </p>
                                            )}
                                            {node.html && (
                                              <pre className="text-xs text-theme-secondary overflow-x-auto whitespace-pre-wrap break-all font-mono">
                                                {node.html}
                                              </pre>
                                            )}
                                            {fixInstructions && (
                                              <div className="mt-2 pt-2 border-t border-theme">
                                                <p className="text-xs font-medium text-theme-muted mb-1">How to fix:</p>
                                                <ul className="text-xs text-theme-secondary space-y-1">
                                                  {fixInstructions.map((instruction, i) => (
                                                    <li key={i} className="flex items-start gap-2">
                                                      <span className="text-accent mt-0.5" aria-hidden="true">·</span>
                                                      <span>{instruction}</span>
                                                    </li>
                                                  ))}
                                                </ul>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                      {hiddenElementCount > 0 && (
                                        <p className="text-xs text-theme-muted text-center py-2">
                                          ...and {hiddenElementCount} more affected element{hiddenElementCount === 1 ? "" : "s"} not shown
                                        </p>
                                      )}
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
