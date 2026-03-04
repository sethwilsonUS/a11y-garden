/**
 * Domain strategy cache — fast Redis-backed lookup.
 *
 * Remembers which domains need BQL so the fallback strategy can skip
 * the BaaS attempt on repeat scans (saves 5-10s). Entries expire after 7 days.
 *
 * Falls back to an in-memory Map when Redis is not configured (local dev).
 */

const CACHE_PREFIX = "domain-strategy:";
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

type CachedStrategy = "bql";

const memoryCache = new Map<string, { strategy: CachedStrategy; expires: number }>();

async function getRedis() {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  const { Redis } = await import("@upstash/redis");
  return Redis.fromEnv();
}

export async function getDomainStrategy(
  domain: string,
): Promise<CachedStrategy | null> {
  const redis = await getRedis();

  if (redis) {
    try {
      const val = await redis.get<string>(CACHE_PREFIX + domain);
      return val === "bql" ? "bql" : null;
    } catch {
      return null;
    }
  }

  const entry = memoryCache.get(domain);
  if (entry && entry.expires > Date.now()) return entry.strategy;
  if (entry) memoryCache.delete(domain);
  return null;
}

export async function setDomainStrategy(
  domain: string,
  strategy: CachedStrategy,
): Promise<void> {
  const redis = await getRedis();

  if (redis) {
    try {
      await redis.set(CACHE_PREFIX + domain, strategy, {
        ex: CACHE_TTL_SECONDS,
      });
    } catch {
      // Non-critical — cache miss just means an extra BaaS attempt
    }
  }

  memoryCache.set(domain, {
    strategy,
    expires: Date.now() + CACHE_TTL_SECONDS * 1000,
  });
}
