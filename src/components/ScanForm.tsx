"use client";

import { useState } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { Id } from "../../convex/_generated/dataModel";

export function ScanForm() {
  const [url, setUrl] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState("");
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    message: string;
    retryAfter?: number;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const createAudit = useMutation(api.audits.createAudit);
  const updateAuditStatus = useMutation(api.audits.updateAuditStatus);
  const updateAuditWithResults = useMutation(api.audits.updateAuditWithResults);
  const updateAuditError = useMutation(api.audits.updateAuditError);
  const analyzeViolations = useAction(api.ai.analyzeViolations);
  const generateUploadUrl = useMutation(api.audits.generateUploadUrl);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setRateLimitInfo(null);
    setIsSubmitting(true);
    setScanStatus("Creating audit...");

    // Validate and normalize URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      // Use http:// for local addresses (no TLS), https:// for everything else
      const looksLocal = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?/i.test(
        normalizedUrl
      );
      normalizedUrl = `${looksLocal ? "http" : "https"}://${normalizedUrl}`;
    }

    try {
      const urlObj = new URL(normalizedUrl);
      // Strip "www." prefix to avoid duplicate records
      if (urlObj.hostname.startsWith("www.")) {
        urlObj.hostname = urlObj.hostname.slice(4);
      }
      normalizedUrl = urlObj.toString();
    } catch {
      setError("Please enter a valid URL");
      setIsSubmitting(false);
      setScanStatus("");
      return;
    }

    // ---- Self-scan warning (dev only) -----------------------------------------
    // In development without a remote browser (Browserless), the Next.js dev
    // server can deadlock when asked to scan its own origin. With Browserless,
    // the Docker URL rewriting makes it work. We show a warning but allow the
    // scan — if Browserless is configured it'll succeed, otherwise the user will
    // see visibly wrong results and know to use the CLI.
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

    try {
      // Step 1: Call the scan API first so rate-limit / capacity rejections
      //         happen before we create an audit row in Convex.
      setScanStatus("Scanning website...");
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
      });

      const scanResult = await response.json();

      // Handle rate-limit (429) and capacity (503) with a friendlier UI
      if (response.status === 429 || response.status === 503) {
        const retryAfter = response.headers.get("Retry-After");
        setRateLimitInfo({
          message: scanResult.error,
          retryAfter: retryAfter ? Number(retryAfter) : undefined,
        });
        setIsSubmitting(false);
        setScanStatus("");
        return;
      }

      // Handle WAF / bot-block detection (403 with blocked flag)
      if (response.status === 403 && scanResult.blocked) {
        setRateLimitInfo({
          message:
            "This site's firewall blocked our automated scanner, so we can't produce accurate results. Try a different URL.",
        });
        setIsSubmitting(false);
        setScanStatus("");
        return;
      }

      if (!response.ok) {
        throw new Error(scanResult.error || "Scan failed");
      }

      // Step 2: Scan succeeded — now create the audit in Convex
      setScanStatus("Saving results...");
      auditId = await createAudit({
        url: normalizedUrl,
        isPublic,
      });

      // Warn in console if the screenshot appears blank (dev/debugging aid)
      if (scanResult.screenshotWarning) {
        console.warn("[A11y Garden]", scanResult.screenshotWarning);
      }

      // Step 3: Upload screenshot to Convex file storage (if available)
      let screenshotId: Id<"_storage"> | undefined;
      if (scanResult.screenshotBase64) {
        try {
          const uploadUrl = await generateUploadUrl();
          const binaryStr = atob(scanResult.screenshotBase64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const uploadResp = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": "image/jpeg" },
            body: bytes,
          });
          if (uploadResp.ok) {
            const { storageId } = await uploadResp.json();
            screenshotId = storageId as Id<"_storage">;
          }
        } catch {
          // Screenshot upload failure shouldn't block saving results
        }
      }

      // Step 4: Update Convex with scan results and mark as complete
      setScanStatus("Finalizing...");
      await updateAuditStatus({ auditId, status: "scanning" });
      await updateAuditWithResults({
        auditId,
        violations: scanResult.violations,
        letterGrade: scanResult.letterGrade,
        score: scanResult.score,
        gradingVersion: scanResult.gradingVersion,
        rawViolations: scanResult.rawViolations,
        status: "complete",
        scanMode: scanResult.safeMode ? "safe" : "full",
        ...(scanResult.pageTitle ? { pageTitle: scanResult.pageTitle } : {}),
        ...(scanResult.truncated ? { truncated: true } : {}),
        ...(screenshotId ? { screenshotId } : {}),
      });

      // Step 5: Fire off AI analysis in background (don't await)
      analyzeViolations({ auditId });

      // Step 6: Navigate to results immediately
      router.push(`/results/${auditId}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create audit";
      setError(errorMessage);

      // Update audit with error if we have an auditId
      if (auditId) {
        await updateAuditError({ auditId, errorMessage });
      }

      setIsSubmitting(false);
      setScanStatus("");
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
        <input
          type="checkbox"
          id="isPublic"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          disabled={isSubmitting}
          className="w-5 h-5 rounded border-[var(--border-color)] bg-theme-tertiary accent-[var(--accent)] focus:ring-[var(--accent)] focus:ring-offset-2 cursor-pointer"
        />
        <label htmlFor="isPublic" className="text-sm text-theme-secondary cursor-pointer">
          Share results in the community garden (public database)
        </label>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className={`relative w-full h-14 btn-primary text-base rounded-xl overflow-hidden ${
          isSubmitting ? "opacity-80 animate-pulse" : ""
        }`}
      >
        {/* Default state */}
        <span
          className={`absolute inset-0 flex items-center justify-center gap-3 transition-all duration-300 ${
            isSubmitting ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Scan for Accessibility Issues
        </span>

        {/* Loading state */}
        <span
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
          <span className="transition-opacity duration-200">
            {scanStatus || "Processing..."}
          </span>
        </span>
      </button>
    </form>
  );
}
