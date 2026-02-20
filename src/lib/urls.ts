/**
 * Utilities for building and parsing pretty results URLs.
 *
 * New format:  /results/{site-slug}/{YYYY-MM-DD}/{auditId}
 * Old format:  /results/{auditId}   (legacy, still supported)
 */

/**
 * Turn a full URL into a readable, URL-safe slug.
 *
 * Strips the protocol, replaces path separators with dashes, and removes
 * query strings / fragments so the slug stays clean.
 *
 * @example slugifyUrl("https://t3.gg/blog")     // → "t3.gg-blog"
 * @example slugifyUrl("https://github.com/vercel/next.js")
 *          // → "github.com-vercel-next.js"
 * @example slugifyUrl("https://example.com/")    // → "example.com"
 */
export function slugifyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // host (includes port if present) + pathname, strip trailing slash, replace / with -
    const path = parsed.pathname.replace(/\/+$/, "").replace(/^\//, "");
    const slug = path ? `${parsed.host}-${path.replace(/\//g, "-")}` : parsed.host;
    return encodeURIComponent(slug);
  } catch {
    // Fallback: strip protocol, collapse slashes to dashes
    return encodeURIComponent(
      url
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "")
        .replace(/\//g, "-"),
    );
  }
}

/**
 * Build a pretty results URL.
 *
 * @example buildResultsUrl("https://t3.gg/blog", 1708387200000, "j57x9abc123")
 *          // → "/results/t3.gg-blog/2026-02-20/j57x9abc123"
 */
export function buildResultsUrl(
  url: string,
  scannedAt: number,
  auditId: string,
): string {
  const slug = slugifyUrl(url);
  const date = new Date(scannedAt).toISOString().split("T")[0]; // YYYY-MM-DD
  return `/results/${slug}/${date}/${auditId}`;
}

/**
 * Extract the audit ID from results route segments.
 *
 * Supports both:
 *   - Old format  → segments = ["auditId"]
 *   - New format  → segments = ["site-slug", "date", "auditId"]
 */
export function parseResultsSegments(segments: string[]): {
  auditId: string;
  isLegacy: boolean;
} {
  if (segments.length === 1) {
    return { auditId: segments[0], isLegacy: true };
  }
  // New format: last segment is always the audit ID
  return { auditId: segments[segments.length - 1], isLegacy: false };
}
