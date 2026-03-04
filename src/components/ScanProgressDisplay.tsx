"use client";

import { useState, useEffect } from "react";

interface ScanProgressDisplayProps {
  /** Raw progress message from server (may contain `waf:` prefix) */
  message: string | undefined;
  /** Timestamp (ms since epoch) when the scan started */
  scannedAt: number;
  /** Additional CSS classes for the outer container */
  className?: string;
  /** Fallback message when no server progress is available yet */
  fallbackMessage?: string;
}

function parseProgress(raw: string | undefined) {
  if (!raw) return { isWaf: false, text: "" };
  if (raw.startsWith("waf:")) return { isWaf: true, text: raw.slice(4) };
  return { isWaf: false, text: raw };
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1_000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

function formatElapsedSpoken(ms: number): string {
  const totalSec = Math.floor(ms / 1_000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) {
    return sec > 0
      ? `${min} minute${min !== 1 ? "s" : ""} ${sec} seconds`
      : `${min} minute${min !== 1 ? "s" : ""}`;
  }
  return `${sec} seconds`;
}

const SR_ANNOUNCE_INTERVAL_MS = 10_000;

export function ScanProgressDisplay({
  message,
  scannedAt,
  className = "",
  fallbackMessage = "Scanning...",
}: ScanProgressDisplayProps) {
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - scannedAt);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsedMs(Date.now() - scannedAt);
    }, 1_000);
    return () => clearInterval(id);
  }, [scannedAt]);

  const { isWaf, text } = parseProgress(message);
  const displayText = text || fallbackMessage;
  const showWafBanner = isWaf || elapsedMs >= 30_000;

  // Quantize elapsed time to 10s intervals for SR announcements.
  // The live region only re-announces when its text content changes,
  // so the quantization prevents VoiceOver from reading every second.
  const srElapsedMs =
    Math.floor(elapsedMs / SR_ANNOUNCE_INTERVAL_MS) * SR_ANNOUNCE_INTERVAL_MS;
  const srTimeStr =
    srElapsedMs >= 5_000 ? `, ${formatElapsedSpoken(srElapsedMs)}` : "";
  const srText = `${displayText}${srTimeStr}`;

  return (
    <div className={className}>
      {/* Progress message + elapsed timer (visual only — updates every 1s) */}
      <div
        className="flex items-center justify-center gap-2 text-theme-secondary"
        aria-hidden="true"
      >
        <span>{displayText}</span>
        {elapsedMs >= 5_000 && (
          <span className="text-sm text-theme-muted tabular-nums">
            {formatElapsed(elapsedMs)}
          </span>
        )}
      </div>

      {/* SR announcement — quantized to 10s intervals to avoid over-announcing */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {srText}
      </div>

      {/* WAF info banner */}
      {showWafBanner && (
        <div
          className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 text-sm flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2 duration-300"
          role="status"
        >
          <svg
            className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-500"
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <p className="font-medium">This site may be behind a firewall</p>
            <p className="mt-1 text-blue-700 dark:text-blue-300/80">
              We&apos;re automatically trying to bypass it. WAF-protected sites
              can take up to 4 minutes to scan. You can switch tabs or apps
              &mdash; your results will be saved automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
