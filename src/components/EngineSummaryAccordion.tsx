"use client";

import { useId, useMemo, useState } from "react";
import type { EngineSummary } from "@/lib/findings";

interface EngineSummaryAccordionProps {
  engineProfile?: string;
  engineSummary?: EngineSummary | string;
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

export function EngineSummaryAccordion({
  engineProfile,
  engineSummary,
  headingLevel = "h2",
}: EngineSummaryAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const parsed = useMemo(() => parseEngineSummary(engineSummary), [engineSummary]);
  const profileLabel = formatEngineProfile(engineProfile);
  const engineCount = parsed?.selectedEngines?.length ?? parsed?.engines?.length ?? 0;
  const failedCount = parsed?.engines?.filter((engine) => engine.status === "failed").length ?? 0;
  const skippedCount = parsed?.engines?.filter((engine) => engine.status === "skipped").length ?? 0;
  const selectedLabels = parsed?.selectedEngines?.map(formatEngineName).join(", ");
  const HeadingTag = headingLevel;

  if (!profileLabel && !parsed) return null;

  return (
    <section className="garden-bed overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 bg-theme-secondary hover:bg-theme-tertiary transition-colors cursor-pointer text-left"
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <div>
          <HeadingTag className="text-lg font-display font-semibold text-theme-primary">
            Scan Engines
          </HeadingTag>
          <p className="text-sm text-theme-secondary">
            {profileLabel ?? "Unknown"} profile
            {engineCount > 0 ? ` • ${engineCount} ${engineCount === 1 ? "engine" : "engines"}` : ""}
            {failedCount > 0
              ? ` • ${failedCount} failed`
              : skippedCount > 0
                ? ` • ${skippedCount} skipped`
                : ""}
          </p>
          {selectedLabels && (
            <p className="text-xs text-theme-muted mt-1">
              {selectedLabels}
            </p>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-theme-secondary transition-transform duration-200 flex-shrink-0 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div id={panelId} className="px-5 py-5 bg-theme-primary border-t border-theme">
          {parsed?.engines?.length ? (
            <div className="space-y-3">
              {parsed.engines.map((engine) => (
                <div
                  key={engine.engine}
                  className="rounded-xl border border-theme bg-theme-secondary px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-theme-primary text-sm">
                        {formatEngineName(engine.engine)}
                      </p>
                      <p className="text-sm text-theme-secondary">
                        {engine.confirmedCount} confirmed, {engine.reviewCount} review
                      </p>
                    </div>
                    <div className="text-right text-sm text-theme-muted">
                      <p>{engine.status}</p>
                      <p>{engine.durationMs} ms</p>
                    </div>
                  </div>
                  {engine.note && (
                    <p className="text-sm text-theme-muted mt-2">
                      {engine.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-theme-muted">
              Engine execution details are not available for this audit.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
