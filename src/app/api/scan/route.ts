import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { calculateGrade, calculateCombinedGrade, GRADING_VERSION } from "@/lib/grading";
import {
  checkRateLimit,
  acquireConcurrencySlot,
  releaseConcurrencySlot,
} from "@/lib/rate-limit";
import { validateUrl } from "@/lib/url-validator";
import { ScanBlockedError } from "@/lib/scanner";
import {
  createScanStrategy,
  type ScanStrategyOptions,
  type StrategyScanResult,
  type ScanModeInfo,
} from "@/lib/scan/strategies";
import {
  getDomainStrategy,
  setDomainStrategy,
} from "@/lib/scan/domain-cache";
import { scanLog } from "@/lib/scan/monitoring/scan-logger";
import { checkRobotsTxt } from "@/lib/robots-check";

// Vercel Pro allows up to 60s for serverless functions
export const maxDuration = 60;

/**
 * Map ScanModeInfo.mode to the DB/API scanMode field.
 * "safe-rules" maps to the legacy "safe" value for backward compat.
 */
function toScanModeField(
  info: ScanModeInfo,
): "full" | "safe" | "jsdom-structural" {
  if (info.mode === "safe-rules") return "safe";
  return info.mode;
}

export async function POST(request: NextRequest) {
  // ---- Env-var guard (fail fast in production) ------------------------------
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.BROWSERLESS_TOKEN &&
    !process.env.BROWSERLESS_URL
  ) {
    return NextResponse.json(
      {
        error:
          "Server misconfiguration: BROWSERLESS_TOKEN (or BROWSERLESS_URL) is not set. " +
          "A cloud browser service is required in production. " +
          "Please add the variable in your hosting provider's environment settings.",
      },
      { status: 500 },
    );
  }

  try {
    // ---- Auth (Clerk) — resolve early so rate limiter can use userId --------
    let userId: string | null = null;
    try {
      const authResult = await auth();
      userId = authResult.userId ?? null;
    } catch {
      // Clerk middleware may not be configured (local mode, tests, etc.)
    }
    const isAuthenticated = !!userId;

    // ---- Rate limit (per-user or per-IP) ------------------------------------
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    const { allowed, limit, remaining, reset } = await checkRateLimit(
      ip,
      userId,
    );

    if (!allowed) {
      const retryAfter = reset
        ? Math.ceil((reset - Date.now()) / 1000)
        : 3600;
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": String(remaining),
          },
        },
      );
    }

    // ---- Global concurrency guard -------------------------------------------
    const slotAcquired = await acquireConcurrencySlot();
    if (!slotAcquired) {
      return NextResponse.json(
        { error: "Too many scans in progress. Please try again in a moment." },
        { status: 503 },
      );
    }

    try {
      // ---- Request validation ------------------------------------------------
      const { url: rawUrl } = await request.json();

      if (!rawUrl) {
        return NextResponse.json(
          { error: "URL is required" },
          { status: 400 },
        );
      }

      // ---- SSRF protection ---------------------------------------------------
      const validation = await validateUrl(rawUrl);
      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.reason },
          { status: 400 },
        );
      }

      // ---- robots.txt advisory check (non-blocking) --------------------------
      const robotsCheck = await checkRobotsTxt(validation.url);

      // ---- Domain strategy cache (skip BaaS for known-WAF domains) -----------
      const domain = new URL(validation.url).hostname.replace(/^www\./, "");
      const cachedStrategy = await getDomainStrategy(domain);

      const strategy = cachedStrategy === "bql" && isAuthenticated
        ? createScanStrategy("bql")
        : createScanStrategy();

      scanLog.scanStarted(
        validation.url,
        strategy.name,
        isAuthenticated,
        cachedStrategy === "bql",
      );

      const strategyOpts: Omit<ScanStrategyOptions, "viewport"> = {
        captureScreenshot: true,
        timeBudgetMs: 55_000,
        isAuthenticated,
      };

      // ---- Run scans (desktop + mobile) -------------------------------------
      const desktopResult = await strategy.scan(validation.url, {
        ...strategyOpts,
        viewport: "desktop",
      });

      const mobileResult = await strategy.scan(validation.url, {
        ...strategyOpts,
        viewport: "mobile",
      });

      // ---- Calculate grades (unchanged) -------------------------------------
      const desktopGrade = calculateGrade(desktopResult.violations);
      const mobileGrade = calculateGrade(mobileResult.violations);
      const combined = calculateCombinedGrade(desktopGrade.score, mobileGrade.score);

      const metadata = desktopResult.metadata;

      // ---- Update domain cache + log ------------------------------------------
      if (metadata) {
        scanLog.scanCompleted(
          validation.url,
          metadata.scanStrategy,
          metadata.scanDurationMs,
          metadata.wafDetected,
          metadata.wafBypassed,
          metadata.wafType,
        );
        if (metadata.wafBypassed) {
          setDomainStrategy(domain, "bql").catch(() => {});
        }
      }

      return NextResponse.json({
        gradingVersion: GRADING_VERSION,
        ...(desktopResult.pageTitle && { pageTitle: desktopResult.pageTitle }),
        ...(desktopResult.platform && { platform: desktopResult.platform }),

        letterGrade: combined.grade,
        score: combined.score,

        ...(metadata && {
          scanStrategy: metadata.scanStrategy,
          wafDetected: metadata.wafDetected,
          wafType: metadata.wafType,
          wafBypassed: metadata.wafBypassed,
          scanDurationMs: metadata.scanDurationMs,
        }),

        ...(robotsCheck.disallowed && {
          robotsDisallowed: true,
          robotsNotice: robotsCheck.notice,
        }),

        desktop: {
          violations: desktopResult.violations,
          letterGrade: desktopGrade.grade,
          score: desktopGrade.score,
          rawViolations: desktopResult.rawViolations,
          safeMode: desktopResult.scanMode.mode !== "full",
          scanMode: toScanModeField(desktopResult.scanMode),
          scanModeDetail: desktopResult.scanMode,
          ...(desktopResult.truncated && { truncated: true }),
          ...(desktopResult.warning && { warning: desktopResult.warning }),
          ...(desktopResult.screenshot && {
            screenshotBase64: desktopResult.screenshot.toString("base64"),
          }),
          ...(desktopResult.screenshotWarning && {
            screenshotWarning: desktopResult.screenshotWarning,
          }),
        },

        mobile: {
          violations: mobileResult.violations,
          letterGrade: mobileGrade.grade,
          score: mobileGrade.score,
          rawViolations: mobileResult.rawViolations,
          safeMode: mobileResult.scanMode.mode !== "full",
          scanMode: toScanModeField(mobileResult.scanMode),
          scanModeDetail: mobileResult.scanMode,
          ...(mobileResult.truncated && { truncated: true }),
          ...(mobileResult.warning && { warning: mobileResult.warning }),
          ...(mobileResult.screenshot && {
            screenshotBase64: mobileResult.screenshot.toString("base64"),
          }),
          ...(mobileResult.screenshotWarning && {
            screenshotWarning: mobileResult.screenshotWarning,
          }),
        },
      });
    } finally {
      // Always release the concurrency slot, even on error
      await releaseConcurrencySlot();
    }
  } catch (error: unknown) {
    if (error instanceof ScanBlockedError) {
      scanLog.wafDetected("(blocked)", error.pageTitle, "blocked");
      return NextResponse.json(
        {
          error: error.requiresAuth
            ? "This site's firewall blocked our scanner. Sign in to unlock firewall bypass."
            : "This site's firewall blocked our scanner. The results would not reflect the real page.",
          blocked: true,
          requiresAuth: error.requiresAuth,
          pageTitle: error.pageTitle,
          httpStatus: error.httpStatus,
        },
        { status: 403 },
      );
    }

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    scanLog.scanFailed("(unknown)", "unknown", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
