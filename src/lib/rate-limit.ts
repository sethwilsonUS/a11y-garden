import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Rate limiting is active when:
//   1. In production (NODE_ENV === "production"), OR
//   2. Explicitly enabled via RATE_LIMIT_ENABLED=true (for local testing)
// AND the required Upstash env vars are present.
// ---------------------------------------------------------------------------

const isRateLimitEnabled =
  (process.env.NODE_ENV === "production" ||
    process.env.RATE_LIMIT_ENABLED === "true") &&
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = isRateLimitEnabled ? Redis.fromEnv() : null;

// Per-IP rate limiter: 10 scans per hour for anonymous users
const anonRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      prefix: "scan-ratelimit-anon",
      analytics: true,
    })
  : null;

// Per-user rate limiter: 30 scans per hour for authenticated users
const userRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1 h"),
      prefix: "scan-ratelimit-user",
      analytics: true,
    })
  : null;

// ---------------------------------------------------------------------------
// Global concurrency guard — limits simultaneous in-flight scans across all
// serverless instances. Each scan is expensive (browser + network), so we cap
// the total to avoid saturating Browserless / memory.
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_SCANS = 10;
const CONCURRENCY_KEY = "scan:active-count";
/** Safety TTL so the counter self-heals if a function crashes mid-scan. */
const CONCURRENCY_TTL_SECONDS = 120;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  limit?: number;
  remaining?: number;
  reset?: number;
}

/**
 * Check rate limit. Uses per-user limit (30/hr) for authenticated users,
 * per-IP limit (10/hr) for anonymous. Returns `{ allowed: true }` when
 * rate limiting is disabled (local dev without RATE_LIMIT_ENABLED).
 */
export async function checkRateLimit(
  ip: string,
  userId?: string | null,
): Promise<RateLimitResult> {
  const limiter = userId ? userRatelimit : anonRatelimit;
  const key = userId ?? ip;

  if (!limiter) {
    return { allowed: true };
  }

  const { success, limit, remaining, reset, pending } =
    await limiter.limit(key);

  pending.catch(() => {});

  return { allowed: success, limit, remaining, reset };
}

/**
 * Try to acquire a global concurrency slot.
 * Returns `true` if a slot was acquired, `false` if at capacity.
 */
export async function acquireConcurrencySlot(): Promise<boolean> {
  if (!redis) return true;

  const count = await redis.incr(CONCURRENCY_KEY);
  // Refresh TTL as a crash-recovery safety net
  await redis.expire(CONCURRENCY_KEY, CONCURRENCY_TTL_SECONDS);

  if (count > MAX_CONCURRENT_SCANS) {
    // Over capacity — release the slot we just took
    await redis.decr(CONCURRENCY_KEY);
    return false;
  }

  return true;
}

/**
 * Release a previously acquired concurrency slot.
 * Safe to call even if acquire was never called (guards against going negative).
 */
export async function releaseConcurrencySlot(): Promise<void> {
  if (!redis) return;

  const count = await redis.decr(CONCURRENCY_KEY);
  if (count < 0) {
    await redis.set(CONCURRENCY_KEY, 0);
  }
}
