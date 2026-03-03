import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface HealthStatus {
  status: "ok" | "degraded" | "down";
  baas: { reachable: boolean; latencyMs?: number; error?: string; endpoint?: string };
  bql: { reachable: boolean; latencyMs?: number; error?: string; endpoint?: string };
  config: {
    hasToken: boolean;
    hasUrl: boolean;
    hasCloudUrl: boolean;
    strategy: string;
  };
}

async function checkBaas(): Promise<HealthStatus["baas"]> {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) return { reachable: false, error: "BROWSERLESS_TOKEN not set" };

  const baseWs =
    process.env.BROWSERLESS_URL ||
    "wss://production-sfo.browserless.io";
  const baseHttp = baseWs
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:");

  const parsed = new URL(baseHttp);
  const hasCustomPath = parsed.pathname !== "/";
  const httpBase = hasCustomPath ? baseHttp : `${baseHttp}/chromium/playwright`;

  const start = Date.now();
  try {
    const res = await fetch(
      `${httpBase}?token=${token}`,
      { method: "HEAD", signal: AbortSignal.timeout(5_000) },
    );
    const reachable = res.status !== 404;
    return {
      reachable,
      latencyMs: Date.now() - start,
      endpoint: httpBase,
      ...(reachable ? {} : { error: `HTTP ${res.status}` }),
    };
  } catch (err) {
    return {
      reachable: false,
      latencyMs: Date.now() - start,
      endpoint: httpBase,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function checkBql(): Promise<HealthStatus["bql"]> {
  const token = process.env.BROWSERLESS_TOKEN;
  const cloudUrl =
    process.env.BROWSERLESS_CLOUD_URL ||
    "https://production-sfo.browserless.io";
  if (!token) return { reachable: false, error: "BROWSERLESS_TOKEN not set" };

  const endpoint = `${cloudUrl}/chromium/bql?token=${token}`;
  const start = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: 'mutation Ping { goto(url: "about:blank", waitUntil: domContentLoaded) { status } }',
        variables: {},
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const reachable = res.ok || res.status === 400;
    return {
      reachable,
      latencyMs: Date.now() - start,
      endpoint: `${cloudUrl}/chromium/bql`,
      ...(!reachable ? { error: `HTTP ${res.status}` } : {}),
    };
  } catch (err) {
    return {
      reachable: false,
      latencyMs: Date.now() - start,
      endpoint: `${cloudUrl}/chromium/bql`,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function GET() {
  const [baas, bql] = await Promise.all([checkBaas(), checkBql()]);

  const status: HealthStatus["status"] =
    baas.reachable && bql.reachable
      ? "ok"
      : baas.reachable || bql.reachable
        ? "degraded"
        : "down";

  const health: HealthStatus = {
    status,
    baas,
    bql,
    config: {
      hasToken: !!process.env.BROWSERLESS_TOKEN,
      hasUrl: !!process.env.BROWSERLESS_URL,
      hasCloudUrl: !!process.env.BROWSERLESS_CLOUD_URL,
      strategy: process.env.SCAN_STRATEGY ?? "(auto-detected)",
    },
  };

  return NextResponse.json(health, {
    status: status === "down" ? 503 : 200,
  });
}
