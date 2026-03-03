import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface HealthStatus {
  status: "ok" | "degraded" | "down";
  baas: { reachable: boolean; latencyMs?: number; error?: string };
  bql: { reachable: boolean; latencyMs?: number; error?: string };
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

  const start = Date.now();
  try {
    const res = await fetch(
      `${baseHttp}/config?token=${token}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    return {
      reachable: res.ok,
      latencyMs: Date.now() - start,
      ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
    };
  } catch (err) {
    return {
      reachable: false,
      latencyMs: Date.now() - start,
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

  const start = Date.now();
  try {
    const res = await fetch(`${cloudUrl}/stealth/bql?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: 'mutation Ping { goto(url: "about:blank") { status } }',
        variables: {},
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return {
      reachable: res.ok || res.status === 400,
      latencyMs: Date.now() - start,
      ...(!res.ok && res.status !== 400 ? { error: `HTTP ${res.status}` } : {}),
    };
  } catch (err) {
    return {
      reachable: false,
      latencyMs: Date.now() - start,
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
