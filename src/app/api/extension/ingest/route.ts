import { after, NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { getConvexClient } from "@/lib/convex-server";
import { calculateGrade, GRADING_VERSION } from "@/lib/grading";
import { buildExtensionResultsUrl } from "@/lib/urls";
import {
  generateAuditAccessToken,
  hashAuditAccessToken,
} from "../../../../../shared/audit-access";

interface CountPayload {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  total: number;
}

function isCountPayload(value: unknown): value is CountPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.critical === "number" &&
    typeof candidate.serious === "number" &&
    typeof candidate.moderate === "number" &&
    typeof candidate.minor === "number" &&
    typeof candidate.total === "number"
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function scheduleAiAnalysis(
  convex: NonNullable<ReturnType<typeof getConvexClient>>,
  auditId: Id<"audits">,
) {
  after(async () => {
    try {
      await convex.action(api.ai.analyzeViolations, { auditId });
    } catch (error) {
      console.error("[Extension Ingest] AI analysis failed:", error);
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const convex = getConvexClient();
    if (!convex) {
      return NextResponse.json(
        { error: "Extension ingest is unavailable because Convex is not configured." },
        { status: 503 },
      );
    }

    const body = await request.json();
    const {
      url,
      pageTitle,
      engineProfile,
      engineSummary,
      rawFindings,
      findingsVersion,
      violations,
      reviewViolations,
      platform,
      viewportWidth,
      viewportHeight,
      scanMode,
      scanModeDetail,
      truncated,
      rawViolations,
    } = body as Record<string, unknown>;

    if (typeof url !== "string" || !isHttpUrl(url)) {
      return NextResponse.json(
        { error: "A valid http(s) URL is required." },
        { status: 400 },
      );
    }
    if (typeof rawFindings !== "string") {
      return NextResponse.json(
        { error: "rawFindings must be a string." },
        { status: 400 },
      );
    }
    if (typeof findingsVersion !== "number") {
      return NextResponse.json(
        { error: "findingsVersion must be a number." },
        { status: 400 },
      );
    }
    if (!isCountPayload(violations) || !isCountPayload(reviewViolations)) {
      return NextResponse.json(
        { error: "violations and reviewViolations are required." },
        { status: 400 },
      );
    }
    if (
      typeof viewportWidth !== "number" ||
      typeof viewportHeight !== "number" ||
      viewportWidth <= 0 ||
      viewportHeight <= 0
    ) {
      return NextResponse.json(
        { error: "viewportWidth and viewportHeight must be positive numbers." },
        { status: 400 },
      );
    }

    const auditId = await convex.mutation(api.audits.createAudit, {
      url,
      isPublic: false,
    });

    const viewToken = generateAuditAccessToken();
    const claimToken = generateAuditAccessToken();
    const [viewTokenHash, claimTokenHash] = await Promise.all([
      hashAuditAccessToken(viewToken),
      hashAuditAccessToken(claimToken),
    ]);

    const grade = calculateGrade(violations);

    await convex.mutation(api.audits.updateAuditWithResults, {
      auditId,
      violations,
      reviewViolations,
      letterGrade: grade.grade,
      score: grade.score,
      gradingVersion: GRADING_VERSION,
      rawFindings,
      findingsVersion,
      engineProfile:
        engineProfile === "comprehensive" ? "comprehensive" : "strict",
      engineSummary:
        typeof engineSummary === "string"
          ? engineSummary
          : JSON.stringify(engineSummary ?? {}),
      status: "complete",
      ...(scanMode === "safe" || scanMode === "jsdom-structural"
        ? { scanMode }
        : {}),
      ...(typeof scanModeDetail === "string" ? { scanModeDetail } : {}),
      ...(typeof rawViolations === "string" ? { rawViolations } : {}),
      ...(truncated === true ? { truncated: true } : {}),
      ...(typeof pageTitle === "string" && pageTitle
        ? { pageTitle }
        : {}),
      ...(typeof platform === "string" && platform ? { platform } : {}),
      scanSource: "extension",
      viewportMode: "live",
      viewportWidth,
      viewportHeight,
      isClaimed: false,
      viewTokenHash,
      claimTokenHash,
    });

    scheduleAiAnalysis(convex, auditId as Id<"audits">);

    const resultsUrl = new URL(
      buildExtensionResultsUrl(url, Date.now(), auditId),
      request.nextUrl.origin,
    ).toString();

    return NextResponse.json({
      auditId,
      resultsUrl,
      viewToken,
      claimToken,
    });
  } catch (error) {
    console.error("[Extension Ingest] Failed:", error);
    return NextResponse.json(
      { error: "Failed to ingest extension scan." },
      { status: 500 },
    );
  }
}
