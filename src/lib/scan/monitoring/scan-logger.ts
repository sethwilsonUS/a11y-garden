/**
 * Structured logging for Browserless scan interactions.
 *
 * Outputs JSON-formatted log lines parseable by log aggregation tools
 * (Vercel Logs, Datadog, etc.). Each log entry includes a consistent
 * set of fields for filtering and dashboarding.
 */

interface ScanLogFields {
  event: string;
  url?: string;
  domain?: string;
  strategy?: string;
  wafDetected?: boolean;
  wafType?: string | null;
  wafBypassed?: boolean;
  durationMs?: number;
  timedOut?: boolean;
  error?: string;
  escalationStep?: string;
  budgetUsed?: number;
  budgetTotal?: number;
  cached?: boolean;
  authenticated?: boolean;
  [key: string]: unknown;
}

type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, fields: ScanLogFields): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "a11y-garden-scan",
    ...fields,
  };

  const msg = `[Scan] ${fields.event}`;

  switch (level) {
    case "error":
      console.error(msg, JSON.stringify(entry));
      break;
    case "warn":
      console.warn(msg, JSON.stringify(entry));
      break;
    default:
      console.log(msg, JSON.stringify(entry));
  }
}

export const scanLog = {
  scanStarted(url: string, strategy: string, authenticated: boolean, cached: boolean) {
    emit("info", {
      event: "scan_started",
      url,
      domain: safeDomain(url),
      strategy,
      authenticated,
      cached,
    });
  },

  scanCompleted(
    url: string,
    strategy: string,
    durationMs: number,
    wafDetected: boolean,
    wafBypassed: boolean,
    wafType?: string | null,
  ) {
    emit("info", {
      event: "scan_completed",
      url,
      domain: safeDomain(url),
      strategy,
      durationMs,
      wafDetected,
      wafBypassed,
      wafType,
    });
  },

  bqlEscalation(url: string, step: string, reason: string) {
    emit("info", {
      event: "bql_escalation",
      url,
      domain: safeDomain(url),
      escalationStep: step,
      error: reason,
    });
  },

  wafDetected(url: string, wafType: string | null, strategy: string) {
    emit("warn", {
      event: "waf_detected",
      url,
      domain: safeDomain(url),
      wafType,
      strategy,
    });
  },

  scanFailed(url: string, strategy: string, error: string, durationMs?: number) {
    emit("error", {
      event: "scan_failed",
      url,
      domain: safeDomain(url),
      strategy,
      error,
      durationMs,
    });
  },

  budgetWarning(used: number, total: number, percentUsed: number) {
    emit("warn", {
      event: "budget_warning",
      budgetUsed: used,
      budgetTotal: total,
      percentUsed,
    });
  },

  rateLimited(identifier: string, authenticated: boolean) {
    emit("warn", {
      event: "rate_limited",
      authenticated,
      identifier: authenticated ? "(user)" : identifier,
    });
  },
};

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}
