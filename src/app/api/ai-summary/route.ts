import { NextRequest, NextResponse } from "next/server";
import { generateAISummary } from "@/lib/ai-summary";

/**
 * POST /api/ai-summary
 *
 * Lightweight endpoint that runs the same OpenAI analysis the CLI uses.
 * The demo page calls this after a scan completes. When OPENAI_API_KEY
 * isn't set in the local environment the endpoint returns 501 and the
 * demo page gracefully falls back to the "sign up" CTA.
 */
export async function POST(request: NextRequest) {
  // Fast-exit when the key isn't configured — this is the expected path
  // for zero-config demo mode.
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 501 },
    );
  }

  try {
    const { rawViolations } = await request.json();

    if (!rawViolations || typeof rawViolations !== "string") {
      return NextResponse.json(
        { error: "rawViolations (string) is required" },
        { status: 400 },
      );
    }

    const result = await generateAISummary(rawViolations);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "AI analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
