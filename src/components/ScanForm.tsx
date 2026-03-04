"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { Id } from "../../convex/_generated/dataModel";
import { buildResultsUrl } from "@/lib/urls";
import { track } from "@/lib/analytics";

const SCAN_PROGRESS_STEPS: [number, string][] = [
  // Phase 1: Lightweight server-side checks (0-3s)
  [0, "Preparing scan…"],
  [2_000, "Connecting to scanner…"],
  // Phase 2: Scanning in progress — keep it honest, we don't know specifics (3-30s)
  [5_000, "Scanning…"],
  [12_000, "Still scanning…"],
  [20_000, "Taking a bit longer than usual…"],
  // Phase 3: WAF bypass likely in progress (30s+)
  [35_000, "This site may have a firewall — working on it…"],
  [50_000, "Firewall bypass in progress…"],
  [70_000, "Still working through the firewall…"],
  [100_000, "Trying another bypass approach…"],
  [130_000, "Still working — complex firewalls can take a few minutes…"],
  [180_000, "Almost there…"],
  [220_000, "Wrapping up…"],
];

const WAF_WARNING_THRESHOLD_MS = 30_000;
const SR_ANNOUNCE_INTERVAL_MS = 10_000;

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

function useScanProgress() {
  const [status, setStatus] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isLikelyWaf, setIsLikelyWaf] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const manualRef = useRef(false);

  const startProgress = useCallback(() => {
    manualRef.current = false;
    setIsLikelyWaf(false);
    setElapsedMs(0);
    startTimeRef.current = Date.now();

    for (const [delay, message] of SCAN_PROGRESS_STEPS) {
      timerRef.current.push(
        setTimeout(() => {
          if (!manualRef.current) setStatus(message);
        }, delay),
      );
    }

    timerRef.current.push(
      setTimeout(() => setIsLikelyWaf(true), WAF_WARNING_THRESHOLD_MS),
    );

    intervalRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 1_000);
  }, []);

  const setManualStatus = useCallback((msg: string) => {
    manualRef.current = true;
    setStatus(msg);
  }, []);

  const stopProgress = useCallback(() => {
    for (const t of timerRef.current) clearTimeout(t);
    timerRef.current = [];
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    manualRef.current = false;
    setStatus("");
    setElapsedMs(0);
    setIsLikelyWaf(false);
  }, []);

  useEffect(() => stopProgress, [stopProgress]);

  return { status, elapsedMs, isLikelyWaf, startProgress, setManualStatus, stopProgress };
}

export function ScanForm() {
  const [url, setUrl] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState("");
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    message: string;
    retryAfter?: number;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeAuditId, setActiveAuditId] = useState<Id<"audits"> | null>(null);
  const { status: scanStatus, elapsedMs, isLikelyWaf, startProgress, setManualStatus: setScanStatus, stopProgress } = useScanProgress();
  const createAudit = useMutation(api.audits.createAudit);
  const updateAuditStatus = useMutation(api.audits.updateAuditStatus);
  const updateAuditError = useMutation(api.audits.updateAuditError);
  const router = useRouter();

  const auditProgress = useQuery(
    api.audits.getAudit,
    activeAuditId ? { auditId: activeAuditId } : "skip",
  );

  const serverProgress = auditProgress?.scanProgress;
  const serverWaf = !!serverProgress?.startsWith("waf:");
  const effectiveStatus = serverProgress
    ? (serverWaf ? serverProgress.slice(4) : serverProgress)
    : scanStatus;
  const showWafBanner = serverWaf || isLikelyWaf;

  // Track in-flight scan so the visibilitychange handler can recover
  const scanRef = useRef<{ auditId: string; resultsUrl: string } | null>(null);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      const scan = scanRef.current;
      if (!scan) return;
      router.push(scan.resultsUrl);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setRateLimitInfo(null);
    setIsSubmitting(true);
    startProgress();

    // Validate and normalize URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      const looksLocal = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?/i.test(
        normalizedUrl
      );
      normalizedUrl = `${looksLocal ? "http" : "https"}://${normalizedUrl}`;
    }

    try {
      new URL(normalizedUrl);
    } catch {
      setError("Please enter a valid URL");
      setIsSubmitting(false);
      stopProgress();
      return;
    }

    track("Scan Submitted", { isPublic });

    // ---- Self-scan warning (dev only) -----------------------------------------
    let isSelfScanInDev = false;
    if (process.env.NODE_ENV === "development") {
      try {
        const target = new URL(normalizedUrl);
        isSelfScanInDev = target.origin === window.location.origin;
      } catch {
        // URL parsing failed — handled by earlier validation
      }
    }

    if (isSelfScanInDev) {
      setScanStatus(
        "Scanning own dev server — requires Browserless (npm run dev:browserless). " +
        "If results look wrong, use: npm run cli localhost:3000"
      );
    }

    let auditId: Id<"audits"> | null = null;
    let resultsUrl: string | null = null;

    try {
      // Step 1: Create the audit in Convex FIRST so the server can persist
      // results directly — making the scan resilient to mobile tab suspension,
      // app switching, and screen lock.
      auditId = await createAudit({
        url: normalizedUrl,
        isPublic,
      });
      setActiveAuditId(auditId);
      await updateAuditStatus({ auditId, status: "scanning" });

      resultsUrl = buildResultsUrl(normalizedUrl, Date.now(), auditId);
      scanRef.current = { auditId, resultsUrl };

      // Step 2: Call the scan API with auditId — the server will persist
      // results to Convex server-side so they survive even if this tab dies.
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl, auditId }),
      });

      const scanResult = await response.json();

      // Handle rate-limit (429) and capacity (503) with a friendlier UI
      if (response.status === 429 || response.status === 503) {
        track("Scan Failed", { reason: "rate_limit" });
        const retryAfter = response.headers.get("Retry-After");
        setRateLimitInfo({
          message: scanResult.error,
          retryAfter: retryAfter ? Number(retryAfter) : undefined,
        });
        await updateAuditError({ auditId, errorMessage: scanResult.error });
        scanRef.current = null;
        setActiveAuditId(null);
        setIsSubmitting(false);
        stopProgress();
        return;
      }

      if (response.status === 403 && scanResult.blocked) {
        track("Scan Failed", {
          reason: scanResult.requiresAuth ? "waf_auth_required" : "waf",
        });
        const msg = scanResult.error || (scanResult.requiresAuth
          ? "This site couldn't be scanned. Sign in to unlock alternative scanning methods."
          : "This site's firewall blocked our automated scanner, so we can't produce accurate results. Try a different URL.");
        setRateLimitInfo({ message: msg });
        await updateAuditError({ auditId, errorMessage: msg });
        scanRef.current = null;
        setActiveAuditId(null);
        setIsSubmitting(false);
        stopProgress();
        return;
      }

      if (!response.ok) {
        throw new Error(scanResult.error || "Scan failed");
      }

      // Step 3: Scan + server-side persistence succeeded — navigate to results.
      // Results (including screenshots and AI analysis) were already saved to
      // Convex by the API route, so no client-side writes are needed.
      scanRef.current = null;
      setActiveAuditId(null);
      stopProgress();
      setIsSubmitting(false);
      track("Scan Completed", {
        grade: scanResult.letterGrade,
        score: scanResult.score,
      });
      router.push(resultsUrl);
    } catch (err: unknown) {
      // Network errors (mobile disconnect, timeout) land here. If we have an
      // auditId, navigate to the results page — the server may still be
      // scanning and will persist results to Convex when done.
      if (auditId && resultsUrl && err instanceof TypeError) {
        scanRef.current = null;
        setActiveAuditId(null);
        router.push(resultsUrl);
        return;
      }

      track("Scan Failed", { reason: "error" });
      const errorMessage = err instanceof Error ? err.message : "Failed to create audit";
      setError(errorMessage);

      if (auditId) {
        await updateAuditError({ auditId, errorMessage }).catch(() => {});
      }

      scanRef.current = null;
      setActiveAuditId(null);
      setIsSubmitting(false);
      stopProgress();
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-2xl mx-auto space-y-6">
      <div>
        <label
          htmlFor="url"
          className="block text-sm font-semibold mb-2 text-theme-primary"
        >
          Website URL
        </label>
        <div className="relative">
          <input
            type="url"
            id="url"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="url"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="example.com or https://example.com"
            required
            disabled={isSubmitting}
            className="w-full px-5 py-4 bg-theme-primary border-2 border-[var(--accent-border)] rounded-xl text-theme-primary placeholder:text-theme-muted focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] transition-all duration-200 disabled:opacity-50 shadow-sm"
            aria-describedby={error ? "url-error" : "url-hint"}
            aria-invalid={error ? "true" : "false"}
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-4">
            <svg
              className="w-5 h-5 text-theme-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
              />
            </svg>
          </div>
        </div>
        <p id="url-hint" className="mt-2 text-sm text-theme-secondary">
          Enter any publicly accessible website URL to scan
        </p>
        {rateLimitInfo && (
          <div
            className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 text-sm flex items-start gap-2.5"
            role="alert"
          >
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="font-medium">{rateLimitInfo.message}</p>
              {rateLimitInfo.retryAfter && (
                <p className="mt-1 text-amber-700 dark:text-amber-300/80">
                  You can try again in{" "}
                  {rateLimitInfo.retryAfter >= 60
                    ? `${Math.ceil(rateLimitInfo.retryAfter / 60)} minute${Math.ceil(rateLimitInfo.retryAfter / 60) === 1 ? "" : "s"}`
                    : `${rateLimitInfo.retryAfter} seconds`}
                  .
                </p>
              )}
            </div>
          </div>
        )}
        {error && (
          <p
            id="url-error"
            className="mt-2 text-sm text-[var(--severity-critical)] flex items-center gap-2"
            role="alert"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 p-4 bg-theme-secondary rounded-xl border border-theme">
        <label
          htmlFor="isPublic"
          className={`flex items-center gap-3 text-sm text-theme-secondary select-none ${
            isSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          {/* Visually-hidden native checkbox for accessibility */}
          <input
            type="checkbox"
            id="isPublic"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            disabled={isSubmitting}
            className="sr-only peer"
          />
          {/* Custom visual checkbox */}
          <span
            aria-hidden="true"
            className="flex-shrink-0 w-5 h-5 rounded-[5px] border-[2.5px] border-[var(--text-primary)] flex items-center justify-center transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]"
          >
            {isPublic && (
              <svg
                className="w-3.5 h-3.5 text-[var(--text-primary)]"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 8.5L6.5 12L13 4" />
              </svg>
            )}
          </span>
          Share results in the community garden (public database)
        </label>
      </div>

      <button
        type="submit"
        disabled={isSubmitting || !url.trim()}
        aria-disabled={isSubmitting || !url.trim()}
        className={`relative w-full h-14 btn-primary text-base rounded-xl overflow-hidden ${
          isSubmitting ? "opacity-80 animate-pulse" : ""
        }`}
      >
        {/* Default state — aria-hidden keeps VoiceOver from reading both spans */}
        <span
          aria-hidden={isSubmitting}
          className={`absolute inset-0 flex items-center justify-center gap-3 transition-all duration-300 ${
            isSubmitting ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Scan for Accessibility Issues
        </span>

        {/* Loading state — aria-hidden keeps VoiceOver from reading both spans */}
        <span
          aria-hidden={!isSubmitting}
          className={`absolute inset-0 flex items-center justify-center gap-3 transition-all duration-300 ${
            isSubmitting ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
          }`}
        >
          <svg
            className="animate-spin h-5 w-5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="transition-opacity duration-200 flex items-center gap-2">
            <span>{effectiveStatus || "Processing..."}</span>
            {elapsedMs >= 5_000 && (
              <span className="text-xs opacity-60 tabular-nums" aria-hidden="true">
                {Math.floor(elapsedMs / 60_000) > 0
                  ? `${Math.floor(elapsedMs / 60_000)}m ${Math.floor((elapsedMs % 60_000) / 1_000)}s`
                  : `${Math.floor(elapsedMs / 1_000)}s`}
              </span>
            )}
          </span>
        </span>
      </button>

      {isSubmitting && showWafBanner && (
        <div
          className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 text-sm flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2 duration-300"
          role="status"
        >
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <p className="font-medium">This site may be behind a firewall</p>
            <p className="mt-1 text-blue-700 dark:text-blue-300/80">
              We&apos;re automatically trying to bypass it. WAF-protected sites can take up to 4 minutes to scan.
              You can switch tabs or apps — your results will be saved automatically.
            </p>
          </div>
        </div>
      )}

      {/* SR progress announcement — quantized to 10s intervals */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isSubmitting
          ? (() => {
              const srElapsedMs = Math.floor(elapsedMs / SR_ANNOUNCE_INTERVAL_MS) * SR_ANNOUNCE_INTERVAL_MS;
              const timeStr = srElapsedMs >= 5_000 ? `, ${formatElapsedSpoken(srElapsedMs)}` : "";
              return `${effectiveStatus || "Scan in progress…"}${timeStr}`;
            })()
          : ""}
      </div>
    </form>
  );
}
