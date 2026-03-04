import type { ViolationCounts } from "@/lib/scanner";

// ---------------------------------------------------------------------------
// Scan mode reporting
// ---------------------------------------------------------------------------

export interface SkippedCategory {
  name: string;
  reason: string;
  ruleIds: string[];
}

export interface ScanModeInfo {
  mode: "full" | "safe-rules" | "jsdom-structural";
  reason?: string;
  rulesRun: number;
  skippedCategories: SkippedCategory[];
}

// ---------------------------------------------------------------------------
// Strategy interface
// ---------------------------------------------------------------------------

export interface ScanStrategyOptions {
  viewport: "desktop" | "mobile";
  captureScreenshot: boolean;
  /** Remaining ms before the Vercel function is killed */
  timeBudgetMs: number;
  /** BQL escalation requires authentication */
  isAuthenticated: boolean;
}

export type ScanStrategyLabel =
  | "baas"
  | "bql-stealth"
  | "bql-proxy"
  | "failed";

export interface ScanMetadata {
  scanStrategy: ScanStrategyLabel;
  wafDetected: boolean;
  wafType: string | null;
  wafBypassed: boolean;
  scanDurationMs: number;
}

export interface StrategyScanResult {
  violations: ViolationCounts;
  rawViolations: string;
  truncated: boolean;
  scanMode: ScanModeInfo;
  screenshot?: Buffer;
  screenshotWarning?: string;
  pageTitle?: string;
  platform?: string;
  warning?: string;
  metadata?: ScanMetadata;
}

export interface ScanStrategy {
  name: string;
  scan(url: string, opts: ScanStrategyOptions): Promise<StrategyScanResult>;
}
