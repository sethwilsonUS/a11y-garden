import { NextRequest, NextResponse } from "next/server";
import { calculateGrade, GRADING_VERSION } from "@/lib/grading";
import {
  checkRateLimit,
  acquireConcurrencySlot,
  releaseConcurrencySlot,
} from "@/lib/rate-limit";
import { validateUrl } from "@/lib/url-validator";
import { scanUrl, ScanBlockedError } from "@/lib/scanner";

// Vercel Pro allows up to 60s for serverless functions
export const maxDuration = 60;

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
    // ---- Rate limit (per-IP, sliding window) --------------------------------
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    const { allowed, limit, remaining, reset } = await checkRateLimit(ip);

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

      // ---- Build browser WS endpoint from env vars --------------------------
      const browserlessToken = process.env.BROWSERLESS_TOKEN;
      const browserlessUrl = process.env.BROWSERLESS_URL;
      const isProduction = process.env.NODE_ENV === "production";

      let browserWSEndpoint: string | undefined;

      if (browserlessUrl) {
        // Custom Browserless URL (e.g., local Docker instance)
        browserWSEndpoint = browserlessToken
          ? `${browserlessUrl}?token=${browserlessToken}`
          : browserlessUrl;
      } else if (isProduction && browserlessToken) {
        // Production: Connect to Browserless.io cloud
        browserWSEndpoint = `wss://chrome.browserless.io?token=${browserlessToken}`;
      }

      // ---- Run the scan -----------------------------------------------------
      const scanResult = await scanUrl(validation.url, {
        browserWSEndpoint,
        captureScreenshot: true,
      });

      // ---- Calculate grade --------------------------------------------------
      const { score, grade } = calculateGrade(scanResult.violations);

      // Return results with grading version for lazy recalc tracking
      return NextResponse.json({
        violations: scanResult.violations,
        letterGrade: grade,
        score,
        gradingVersion: GRADING_VERSION,
        rawViolations: scanResult.rawViolations,
        // Indicate if we used safe mode (fell back to curated safe rules)
        safeMode: scanResult.safeMode,
        // Flag when node details were trimmed to fit the size cap
        ...(scanResult.truncated && { truncated: true }),
        // Include page title if we got one
        ...(scanResult.pageTitle && { pageTitle: scanResult.pageTitle }),
        // Include warning if site was too complex for full scan
        ...(scanResult.warning && { warning: scanResult.warning }),
        // Include base64-encoded JPEG screenshot for client-side upload to Convex
        ...(scanResult.screenshot && {
          screenshotBase64: scanResult.screenshot.toString("base64"),
        }),
        // Include screenshot warning (e.g. "appears blank") so the client can display it
        ...(scanResult.screenshotWarning && {
          screenshotWarning: scanResult.screenshotWarning,
        }),
      });
    } finally {
      // Always release the concurrency slot, even on error
      await releaseConcurrencySlot();
    }
  } catch (error: unknown) {
    // Handle WAF / bot-block detection
    if (error instanceof ScanBlockedError) {
      return NextResponse.json(
        {
          error:
            "This site's firewall blocked our scanner. The results would not reflect the real page.",
          blocked: true,
          pageTitle: error.pageTitle,
          httpStatus: error.httpStatus,
        },
        { status: 403 },
      );
    }

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
