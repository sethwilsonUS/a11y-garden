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
  type ScanModeInfo,
} from "@/lib/scan/strategies";
import {
  getDomainStrategy,
  setDomainStrategy,
} from "@/lib/scan/domain-cache";
import { scanLog } from "@/lib/scan/monitoring/scan-logger";
import { checkRobotsTxt } from "@/lib/robots-check";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

// Vercel Pro allows up to 300s for serverless functions
export const maxDuration = 300;

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

  let convexToken: string | null = null;
  let auditId: Id<"audits"> | undefined;

  try {
    // ---- Auth (Clerk) — resolve early so rate limiter can use userId --------
    let userId: string | null = null;
    try {
      const authResult = await auth();
      userId = authResult.userId ?? null;
      if (userId) {
        convexToken = await authResult.getToken({ template: "convex" }) ?? null;
      }
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
      const { url: rawUrl, auditId: rawAuditId } = await request.json();
      auditId = rawAuditId as Id<"audits"> | undefined;

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

      // ---- Real-time progress emitter -----------------------------------------
      const emitProgress = async (msg: string) => {
        if (!auditId) return;
        try {
          const c = getConvexClient(convexToken);
          if (!c) return;
          await c.mutation(api.audits.updateScanProgress, {
            auditId,
            scanProgress: msg,
          });
        } catch (err) {
          console.warn(
            `[Scan] emitProgress failed for "${msg}":`,
            err instanceof Error ? err.message : err,
          );
        }
      };

      // ---- robots.txt advisory check (non-blocking) --------------------------
      const robotsCheck = await checkRobotsTxt(validation.url);

      await emitProgress("Preparing scan...");

      // ---- Domain strategy cache (skip BaaS for known-WAF domains) -----------
      const domain = new URL(validation.url).hostname.replace(/^www\./, "");
      const cachedStrategy = await getDomainStrategy(domain);

      const strategy = cachedStrategy === "bql" && isAuthenticated
        ? await createScanStrategy("bql")
        : await createScanStrategy();

      scanLog.scanStarted(
        validation.url,
        strategy.name,
        isAuthenticated,
        cachedStrategy === "bql",
      );

      const strategyOpts: Omit<ScanStrategyOptions, "viewport"> = {
        captureScreenshot: true,
        timeBudgetMs: 240_000,
        isAuthenticated,
        onProgress: (msg) => { emitProgress(msg); },
      };

      // ---- Run scans (desktop + mobile) -------------------------------------
      await emitProgress("Scanning desktop viewport...");
      const desktopResult = await strategy.scan(validation.url, {
        ...strategyOpts,
        viewport: "desktop",
      });

      console.warn(
        `[Scan] Desktop done: screenshot=${desktopResult.screenshot ? `${desktopResult.screenshot.length}B` : "NONE"}, ` +
        `warning=${desktopResult.screenshotWarning ?? "none"}, strategy=${desktopResult.metadata?.scanStrategy ?? strategy.name}`,
      );

      await emitProgress("Desktop complete — scanning mobile viewport...");
      const mobileResult = await strategy.scan(validation.url, {
        ...strategyOpts,
        viewport: "mobile",
      });

      console.warn(
        `[Scan] Mobile done: screenshot=${mobileResult.screenshot ? `${mobileResult.screenshot.length}B` : "NONE"}, ` +
        `warning=${mobileResult.screenshotWarning ?? "none"}`,
      );

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

      await emitProgress("Processing results...");

      // ---- Server-side Convex persistence (mobile-resilient) ----------------
      // When the client provides an auditId, persist results directly to Convex
      // so results survive even if the client disconnects (mobile tab suspend,
      // app switch, screen lock).
      let persisted = false;
      if (auditId) {
        await emitProgress("Saving results...");
        try {
          const convex = getConvexClient(convexToken);
          if (convex) {
            // Upload screenshots to Convex file storage
            const uploadScreenshot = async (
              buf: Buffer | undefined,
            ): Promise<Id<"_storage"> | undefined> => {
              if (!buf) return undefined;
              try {
                const uploadUrl: string = await convex.mutation(
                  api.audits.generateUploadUrl,
                );
                const uploadResp = await fetch(uploadUrl, {
                  method: "POST",
                  headers: { "Content-Type": "image/jpeg" },
                  body: new Uint8Array(buf),
                });
                if (uploadResp.ok) {
                  const { storageId } = await uploadResp.json();
                  return storageId as Id<"_storage">;
                }
              } catch {
                // Screenshot upload failure shouldn't block saving results
              }
              return undefined;
            };

            const [screenshotId, mobileScreenshotId] = await Promise.all([
              uploadScreenshot(desktopResult.screenshot),
              uploadScreenshot(mobileResult.screenshot),
            ]);

            await convex.mutation(api.audits.updateAuditWithResults, {
              auditId,
              violations: desktopResult.violations,
              letterGrade: combined.grade,
              score: combined.score,
              gradingVersion: GRADING_VERSION,
              rawViolations: desktopResult.rawViolations,
              status: "complete" as const,
              scanMode: toScanModeField(desktopResult.scanMode),
              ...(desktopResult.scanMode
                ? { scanModeDetail: JSON.stringify(desktopResult.scanMode) }
                : {}),
              ...(metadata?.scanStrategy
                ? { scanStrategy: metadata.scanStrategy }
                : {}),
              ...(metadata?.wafDetected != null
                ? { wafDetected: metadata.wafDetected }
                : {}),
              ...(metadata?.wafType ? { wafType: metadata.wafType } : {}),
              ...(metadata?.wafBypassed != null
                ? { wafBypassed: metadata.wafBypassed }
                : {}),
              ...(metadata?.scanDurationMs != null
                ? { scanDurationMs: metadata.scanDurationMs }
                : {}),
              ...(desktopResult.pageTitle
                ? { pageTitle: desktopResult.pageTitle }
                : {}),
              ...(desktopResult.truncated ? { truncated: true } : {}),
              ...(screenshotId ? { screenshotId } : {}),
              ...(desktopResult.platform
                ? { platform: desktopResult.platform }
                : {}),
              mobileViolations: mobileResult.violations,
              mobileLetterGrade: mobileGrade.grade,
              mobileScore: mobileGrade.score,
              mobileRawViolations: mobileResult.rawViolations,
              mobileScanMode: toScanModeField(mobileResult.scanMode),
              ...(mobileResult.scanMode
                ? {
                    mobileScanModeDetail: JSON.stringify(
                      mobileResult.scanMode,
                    ),
                  }
                : {}),
              ...(mobileResult.truncated ? { mobileTruncated: true } : {}),
              ...(mobileScreenshotId ? { mobileScreenshotId } : {}),
              ...(robotsCheck.disallowed ? { robotsDisallowed: true } : {}),
            });

            // Fire AI analysis (non-blocking)
            convex
              .action(api.ai.analyzeViolations, { auditId })
              .catch(() => {});

            persisted = true;
            console.warn("[Scan] Results persisted to Convex server-side");
          }
        } catch (persistErr) {
          console.error(
            "[Scan] Server-side Convex persistence failed (client can recover):",
            persistErr instanceof Error ? persistErr.message : persistErr,
          );
        }
      }

      const responsePayload = {
        persisted,
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
      };

      const responseJson = JSON.stringify(responsePayload);
      const responseSizeMB = (responseJson.length / (1024 * 1024)).toFixed(2);
      const desktopScreenshotKB = desktopResult.screenshot
        ? Math.round(desktopResult.screenshot.toString("base64").length / 1024)
        : 0;
      const mobileScreenshotKB = mobileResult.screenshot
        ? Math.round(mobileResult.screenshot.toString("base64").length / 1024)
        : 0;
      console.warn(
        `[Scan] Response size: ${responseSizeMB}MB ` +
        `(desktop screenshot: ${desktopScreenshotKB}KB, mobile: ${mobileScreenshotKB}KB, ` +
        `rawViolations: ${Math.round((desktopResult.rawViolations.length + mobileResult.rawViolations.length) / 1024)}KB)`,
      );

      // Vercel has a 4.5MB response body limit. If we're over, drop screenshots
      // to ensure results still get through.
      if (responseJson.length > 4_400_000) {
        console.warn(
          `[Scan] Response ${responseSizeMB}MB exceeds Vercel safe limit — dropping screenshots to fit`,
        );
        delete (responsePayload as Record<string, unknown>).desktop;
        delete (responsePayload as Record<string, unknown>).mobile;
        const stripped = {
          ...responsePayload,
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
            screenshotWarning: "Screenshot omitted — response too large for serverless delivery.",
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
            screenshotWarning: "Screenshot omitted — response too large for serverless delivery.",
          },
        };
        return NextResponse.json(stripped);
      }

      return NextResponse.json(responsePayload);
    } finally {
      // Always release the concurrency slot, even on error
      await releaseConcurrencySlot();
    }
  } catch (error: unknown) {
    // Try to mark the audit as errored so the results page doesn't spin forever
    if (auditId) {
      try {
        const convex = getConvexClient(convexToken);
        if (convex) {
          const msg =
            error instanceof Error ? error.message : "Unknown scan error";
          await convex.mutation(api.audits.updateAuditError, {
            auditId,
            errorMessage: msg,
          });
        }
      } catch {
        // Best-effort; client-side recovery still possible
      }
    }

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
    const status = errorMessage.includes("quota exceeded") ? 503 : 500;
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
