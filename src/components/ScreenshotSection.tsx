"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface ScreenshotSectionProps {
  auditId: Id<"audits">;
}

/**
 * Collapsible section that displays the page screenshot captured at scan time.
 * Lets users verify the scanner saw the real site (not a WAF / honeypot page).
 *
 * Three states:
 *  - Query loading (undefined) → don't render yet
 *  - No screenshot (null)      → subtle "not available" note
 *  - Screenshot available (URL) → collapsible image viewer
 */
export function ScreenshotSection({ auditId }: ScreenshotSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const screenshotUrl = useQuery(api.audits.getScreenshotUrl, { auditId });

  // Still loading — don't render anything to avoid layout shift
  if (screenshotUrl === undefined) return null;

  // No screenshot available — show a subtle note
  if (screenshotUrl === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-theme-muted px-1">
        <svg
          className="w-4 h-4 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <p>
          No screenshot available for this scan — this audit may predate the screenshot feature, or the capture didn&apos;t complete.
        </p>
      </div>
    );
  }

  return (
    <section className="garden-bed overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between bg-theme-secondary hover:bg-theme-tertiary transition-colors cursor-pointer rounded-t-2xl"
        aria-expanded={isOpen}
        aria-controls="screenshot-panel"
      >
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-theme-secondary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span className="font-display font-semibold text-theme-primary">
            Page Screenshot
          </span>
          <span className="text-sm text-theme-muted">
            Verify scanned page
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-theme-secondary transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          id="screenshot-panel"
          className="p-6 bg-theme-primary border-t border-theme"
        >
          <div className="rounded-lg overflow-hidden border border-theme shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screenshotUrl}
              alt="Screenshot of the scanned page at the time of the audit"
              className="w-full h-auto"
              loading="lazy"
            />
          </div>
          <p className="text-xs text-theme-muted mt-3 text-center">
            Screenshot captured at the time of scan — confirms the scanner reached the real page.
          </p>
        </div>
      )}
    </section>
  );
}
