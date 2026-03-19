"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { GradeBadge } from "@/components/GradeBadge";
import { ViolationCard } from "@/components/ViolationCard";
import { SafeModeModal } from "@/components/SafeModeModal";
import { AVAILABLE_MODELS, DEFAULT_AI_MODEL, formatModelPrice, getModelLabel } from "@/lib/ai-summary";
import { FindingDetailsAccordion } from "@/components/FindingDetailsAccordion";
import { EngineSummaryAccordion } from "@/components/EngineSummaryAccordion";
import type { EngineProfile, EngineSummary } from "@/lib/findings";

interface ScanResult {
  url: string;
  pageTitle?: string;
  violations: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    total: number;
  };
  reviewViolations: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    total: number;
  };
  letterGrade: "A" | "B" | "C" | "D" | "F";
  score: number;
  rawFindings: string;
  engineProfile: EngineProfile;
  engineSummary?: EngineSummary;
  safeMode?: boolean;
  scannedAt: number;
  aiSummary?: string;
  topIssues?: string[];
  aiModel?: string;
  platform?: string;
  platformTip?: string;
}

export default function DemoPage() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [safeModeOpen, setSafeModeOpen] = useState(false);
  const closeSafeMode = useCallback(() => setSafeModeOpen(false), []);
  const [aiModel, setAiModel] = useState(DEFAULT_AI_MODEL);
  const [aiLoading, setAiLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    setAiLoading(false);
    setScanStatus("Initializing scan...");
    setResult(null);

    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      // Use http:// for local addresses (no TLS), https:// for everything else
      const looksLocal = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?/i.test(normalizedUrl);
      normalizedUrl = `${looksLocal ? "http" : "https"}://${normalizedUrl}`;
    }

    try {
      new URL(normalizedUrl);
    } catch {
      setError("Please enter a valid URL");
      setIsSubmitting(false);
      setScanStatus("");
      return;
    }

    // ---- Self-scan warning (dev only) -----------------------------------------
    let selfScanWarning = "";
    if (process.env.NODE_ENV === "development") {
      try {
        const target = new URL(normalizedUrl);
        if (target.origin === window.location.origin) {
          selfScanWarning =
            "Scanning own dev server — requires Browserless (npm run dev:browserless). " +
            "If results look wrong, use: npm run cli localhost:3000";
        }
      } catch {
        // URL parsing failed — handled by earlier validation
      }
    }

    try {
      setScanStatus(
        selfScanWarning || "Scanning website for accessibility issues..."
      );

      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl, engineProfile: "strict" }),
      });

      const scanPayload = await response.json();

      if (!response.ok) {
        throw new Error(scanPayload.error || "Scan failed");
      }

      const scanResult = scanPayload.desktop;
      if (!scanResult) {
        throw new Error("Desktop scan results were missing from the response");
      }

      const scanData: ScanResult = {
        url: normalizedUrl,
        pageTitle: scanPayload.pageTitle || undefined,
        violations: scanResult.violations,
        reviewViolations: scanResult.reviewViolations,
        letterGrade: scanResult.letterGrade,
        score: scanResult.score,
        rawFindings: scanResult.rawFindings,
        engineProfile: scanResult.engineProfile,
        engineSummary: scanResult.engineSummary,
        safeMode: scanResult.safeMode,
        scannedAt: Date.now(),
        ...(scanPayload.platform && { platform: scanPayload.platform }),
      };

      setResult(scanData);

      // ---- AI summary (best-effort) -----------------------------------------
      // If the user has OPENAI_API_KEY in .env.local the Next.js server can
      // generate an AI summary locally — same path the CLI uses. When the key
      // isn't set the endpoint returns 501 and we silently degrade.
      if (scanResult.rawFindings) {
        setAiLoading(true);
        try {
          const modelLabel = getModelLabel(aiModel);
          setScanStatus(`Generating AI summary with ${modelLabel}...`);
          const aiRes = await fetch("/api/ai-summary", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rawFindings: scanResult.rawFindings,
              model: aiModel,
              ...(scanPayload.platform && { platform: scanPayload.platform }),
            }),
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            setResult((prev) =>
              prev ? { ...prev, aiSummary: aiData.summary, topIssues: aiData.topIssues, aiModel: aiData.model, ...(aiData.platformTip ? { platformTip: aiData.platformTip } : {}) } : prev,
            );
          }
          // Non-ok (501 = no key, 500 = error) — silently degrade
        } catch {
          // Network error — silently degrade
        } finally {
          setAiLoading(false);
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to scan website";
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
      setScanStatus("");
    }
  };

  return (
    <div className="min-h-screen pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-theme">
        <div className="absolute inset-0 animated-gradient opacity-50" />
        <div className="absolute inset-0 pattern-leaves opacity-20" />

        <div className="relative container mx-auto px-4 py-12">
          <div className="max-w-3xl mx-auto">
            {/* Demo Mode Badge */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <span
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border"
                style={{
                  backgroundColor: 'var(--severity-moderate-bg)',
                  borderColor: 'var(--severity-moderate-border)',
                  color: 'var(--severity-moderate)',
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Demo Mode — No Account Required
              </span>
            </div>

            <h1 className="text-4xl lg:text-5xl font-display font-bold text-theme-primary mb-4 text-center">
              Try A11y Garden
            </h1>
            <p className="text-lg text-theme-secondary text-center mb-8 max-w-2xl mx-auto leading-relaxed">
              Experience the core scanning functionality without creating an account.
              Results are not saved — this is just for testing.
            </p>

            {/* Scan Form */}
            <form onSubmit={handleSubmit} noValidate className="garden-bed p-6 shadow-lg">
              <label htmlFor="demo-url" className="block text-sm font-semibold mb-2 text-theme-primary">
                Website URL
              </label>
              <div className="flex gap-3">
                <input
                  type="url"
                  id="demo-url"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="url"
                  spellCheck={false}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="example.com"
                  required
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-3 bg-theme-primary border-2 border-[var(--accent-border)] rounded-xl text-theme-primary placeholder:text-theme-muted focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] transition-all duration-200 disabled:opacity-50"
                  aria-describedby={error ? "demo-url-error" : undefined}
                  aria-invalid={error ? "true" : "false"}
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`btn-primary px-6 ${isSubmitting ? "opacity-80" : ""}`}
                >
                  {isSubmitting ? (
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24" aria-label="Scanning">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    "Scan"
                  )}
                </button>
              </div>

              {/* AI Model Selector — local experimentation only */}
              <div className="mt-4 flex items-center gap-3">
                <label htmlFor="ai-model" className="text-sm font-medium text-theme-secondary whitespace-nowrap">
                  <svg className="w-4 h-4 inline-block mr-1.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI Model
                </label>
                <select
                  id="ai-model"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  disabled={isSubmitting}
                  className="flex-1 px-3 py-2 bg-theme-primary border-2 border-theme rounded-lg text-sm text-theme-primary focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] transition-all duration-200 disabled:opacity-50 cursor-pointer"
                  aria-describedby="ai-model-hint"
                >
                  {AVAILABLE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} — {formatModelPrice(m)} per 1M tokens
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1.5 text-xs text-theme-muted">
                Demo mode uses the strict axe-only profile.{" "}
                <Link href="/" className="text-accent underline underline-offset-2">
                  Sign in on the main scanner
                </Link>{" "}
                to unlock comprehensive multi-engine scans and saved audits.
              </p>
              <p id="ai-model-hint" className="mt-1.5 text-xs text-theme-muted">
                Compare insight quality across models. Prices shown per 1M tokens (in/out). Requires <code className="bg-theme-tertiary px-1 py-0.5 rounded font-mono">OPENAI_API_KEY</code>.
              </p>

              {isSubmitting && (
                <p className="mt-3 text-sm text-accent flex items-center gap-2" role="status">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {scanStatus}
                </p>
              )}

              {error && (
                <p
                  id="demo-url-error"
                  className="mt-3 text-sm text-[var(--severity-critical)] flex items-center gap-2"
                  role="alert"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  {error}
                </p>
              )}
            </form>

            {/* Info box */}
            <div className="mt-6 p-4 garden-bed">
              <div className="flex gap-3">
                <svg className="w-5 h-5 text-theme-muted flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-theme-secondary">
                  <p className="mb-2">
                    <strong className="text-theme-primary">Demo mode limitations:</strong>
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-theme-muted">
                    <li>Results are not saved to the database</li>
                    <li>AI summaries require <code className="text-xs bg-theme-tertiary px-1.5 py-0.5 rounded font-mono">OPENAI_API_KEY</code> in <code className="text-xs bg-theme-tertiary px-1.5 py-0.5 rounded font-mono">.env.local</code></li>
                    <li>No account history or dashboard</li>
                  </ul>
                  <p className="mt-3">
                    <Link href="/" className="text-accent hover:underline transition-colors">
                      Create an account →
                    </Link>{" "}
                    for the full experience with saved reports, AI insights, and more.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Results Section */}
      {result && (
        <section className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div>
                <h2 className="text-3xl lg:text-4xl font-display font-bold text-theme-primary mb-2">
                  {result.pageTitle || "Accessibility Report"}
                </h2>
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline font-mono text-sm break-all inline-flex items-center gap-2 transition-colors"
                >
                  {(() => {
                    try {
                      const u = new URL(result.url);
                      const path = u.pathname.replace(/\/$/, "");
                      return u.host + path;
                    } catch {
                      return new URL(result.url).hostname;
                    }
                  })()}
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                  <p className="text-sm text-theme-muted">Scanned just now</p>
                  {result.platform && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-theme-secondary border border-theme text-theme-secondary">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                      Built with {
                        ({ wordpress: "WordPress", squarespace: "Squarespace", shopify: "Shopify", wix: "Wix", webflow: "Webflow", drupal: "Drupal", joomla: "Joomla", ghost: "Ghost", hubspot: "HubSpot", weebly: "Weebly" } as Record<string, string>)[result.platform] ?? result.platform
                      }
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-theme-secondary border border-theme text-theme-secondary">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
                    </svg>
                    {result.engineProfile === "comprehensive" ? "Comprehensive" : "Strict"} profile
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-center lg:items-end gap-2">
                <GradeBadge grade={result.letterGrade} score={result.score} size="lg" />
                <p className="text-xs text-theme-muted italic">
                  Based on automated checks only
                </p>
              </div>
            </div>

            {/* Safe Mode Banner */}
            {result.safeMode && (
              <>
                <div
                  className="rounded-xl p-4 flex items-start gap-3 border"
                  style={{
                    backgroundColor: 'var(--severity-moderate-bg)',
                    borderColor: 'var(--severity-moderate-border)',
                  }}
                  role="note"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--severity-moderate-bg)' }}>
                    <svg className="w-4 h-4" style={{ color: 'var(--severity-moderate)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--severity-moderate)' }}>Safe Mode</h3>
                    <p className="text-sm text-theme-secondary">
                      Because of this site&apos;s complexity, this scan ran in Safe Mode.
                      Not all checks were performed.
                    </p>
                    <button
                      onClick={() => setSafeModeOpen(true)}
                      className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium cursor-pointer hover:underline transition-colors"
                      style={{ color: 'var(--severity-moderate)' }}
                    >
                      Learn More
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
                <SafeModeModal open={safeModeOpen} onClose={closeSafeMode} />
              </>
            )}

            {/* Violations */}
            <section>
              <h3 className="text-xl font-display font-bold text-theme-primary mb-4">
                Issue Beds
              </h3>
              <ViolationCard violations={result.violations} />
            </section>

            {result.reviewViolations.total > 0 && (
              <section>
                <h3 className="text-xl font-display font-bold text-theme-primary mb-2">
                  Needs Review
                </h3>
                <p className="text-sm text-theme-secondary mb-4">
                  These lower-confidence findings do not affect the grade, but they&apos;re worth checking by hand.
                </p>
                <ViolationCard violations={result.reviewViolations} />
              </section>
            )}

            <EngineSummaryAccordion
              engineProfile={result.engineProfile}
              engineSummary={result.engineSummary}
              headingLevel="h3"
            />

            {/* AI Summary */}
            <section className="garden-bed p-6 lg:p-8 bg-[var(--accent-bg)]" style={{ borderColor: 'var(--accent-border)' }}>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--accent-bg)] border border-[var(--accent-border)] flex items-center justify-center">
                  {result.aiSummary ? (
                    <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  ) : aiLoading ? (
                    <svg className="w-5 h-5 text-accent animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-display font-semibold text-theme-primary">AI Summary</h3>
                    {result.aiModel && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--accent-bg)] border border-[var(--accent-border)] text-accent">
                        {getModelLabel(result.aiModel)}
                      </span>
                    )}
                  </div>
                  {result.aiSummary ? (
                    <>
                      <p className="text-theme-secondary leading-relaxed">
                        {result.aiSummary}
                      </p>
                      <p className="text-xs text-theme-muted mt-3 flex items-center gap-1.5">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Powered by OpenAI {getModelLabel(result.aiModel)}
                      </p>
                    </>
                  ) : aiLoading ? (
                    <div className="space-y-2" aria-label="Loading AI summary">
                      <div className="h-4 bg-[var(--accent-bg)] rounded animate-pulse w-full" />
                      <div className="h-4 bg-[var(--accent-bg)] rounded animate-pulse w-5/6" />
                      <div className="h-4 bg-[var(--accent-bg)] rounded animate-pulse w-4/6" />
                    </div>
                  ) : (
                    <p className="text-theme-muted">
                      Add your{" "}
                      <code className="text-xs bg-theme-tertiary px-1.5 py-0.5 rounded font-mono">OPENAI_API_KEY</code>{" "}
                      to{" "}
                      <code className="text-xs bg-theme-tertiary px-1.5 py-0.5 rounded font-mono">.env.local</code>{" "}
                      to unlock AI-powered summaries and plain-English explanations.
                      Get a key at{" "}
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline transition-colors"
                      >
                        platform.openai.com
                      </a>
                      , then restart the dev server.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Top Issues — "Areas to Tend First" */}
            {result.topIssues && result.topIssues.length > 0 ? (
              <section>
                <h3 className="text-xl font-display font-bold text-theme-primary mb-4">
                  Areas to Tend First
                </h3>
                <div className="space-y-3">
                  {result.topIssues.map((issue, index) => (
                    <div
                      key={index}
                      className="flex gap-4 p-5 garden-bed"
                    >
                      <span className="flex-shrink-0 w-8 h-8 bg-[var(--btn-primary-bg)] text-white rounded-lg flex items-center justify-center text-sm font-display font-bold shadow-md">
                        {index + 1}
                      </span>
                      <span className="text-theme-secondary leading-relaxed pt-1">
                        {issue}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : aiLoading && result.violations.total > 0 ? (
              <section>
                <h3 className="text-xl font-display font-bold text-theme-primary mb-4">
                  Areas to Tend First
                </h3>
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className="flex gap-4 p-5 garden-bed"
                    >
                      <span className="flex-shrink-0 w-8 h-8 bg-theme-tertiary rounded-lg animate-pulse" />
                      <div className="flex-1 space-y-2 pt-1">
                        <div className="h-4 bg-theme-tertiary rounded animate-pulse w-full" />
                        <div className="h-4 bg-theme-tertiary rounded animate-pulse w-3/4" />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Detailed Findings */}
            {result.rawFindings && result.violations.total > 0 && (
              <FindingDetailsAccordion
                idPrefix="demo-confirmed"
                rawFindings={result.rawFindings}
                disposition="confirmed"
                title="Confirmed Findings"
              />
            )}

            {result.rawFindings && result.reviewViolations.total > 0 && (
              <FindingDetailsAccordion
                idPrefix="demo-review"
                rawFindings={result.rawFindings}
                disposition="needs-review"
                title="Needs Review Details"
                description="These items should be manually reviewed before treating them as confirmed defects."
              />
            )}

            {/* Actions */}
            <section className="flex flex-col sm:flex-row gap-4 pt-4">
              <button
                onClick={() => {
                  setResult(null);
                  setUrl("");
                }}
                className="btn-primary cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Scan Another Site
              </button>
              <Link href="/sign-up" className="btn-secondary">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Create Free Account
              </Link>
            </section>
          </div>
        </section>
      )}

      {/* Empty state */}
      {!result && !isSubmitting && (
        <section className="container mx-auto px-4 py-16">
          <div className="max-w-2xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-theme-secondary border border-theme mb-6">
              <svg className="w-8 h-8 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-display font-bold text-theme-primary mb-4">
              Ready to Scan
            </h2>
            <p className="text-theme-secondary leading-relaxed">
              Enter a URL above to test any website for accessibility issues.
              The scan typically takes 10-30 seconds depending on the site&apos;s complexity.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
