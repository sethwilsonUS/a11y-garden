/**
 * Lightweight robots.txt checker — advisory only.
 *
 * Fetches /robots.txt for the target domain and checks whether the
 * requested path is disallowed for the wildcard (`*`) user-agent.
 *
 * This is NOT a hard block — accessibility audits are single-page,
 * user-initiated, and have legal safe harbors under ADA/Section 508/EAA.
 * The result is surfaced as an advisory notice in scan results.
 */

const FETCH_TIMEOUT_MS = 3_000;

export interface RobotsCheckResult {
  disallowed: boolean;
  notice: string | null;
}

interface RobotsRule {
  pattern: string;
  allow: boolean;
}

/**
 * Check if a URL's path is disallowed by the site's robots.txt.
 * Returns quickly (3s timeout) and never throws — scan proceeds regardless.
 */
export async function checkRobotsTxt(url: string): Promise<RobotsCheckResult> {
  try {
    const parsed = new URL(url);
    const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;

    const res = await fetch(robotsUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "A11yGarden/1.0 (accessibility audit)" },
    });

    if (!res.ok) {
      // No robots.txt or server error — treat as fully allowed
      return { disallowed: false, notice: null };
    }

    const text = await res.text();
    const rules = parseRobotsTxt(text);
    const path = parsed.pathname + parsed.search;

    if (isDisallowed(path, rules)) {
      return {
        disallowed: true,
        notice:
          "This page is marked as disallowed in robots.txt. " +
          "The site owner may not intend for automated tools to access it. " +
          "This accessibility audit proceeded because it was explicitly requested by a user.",
      };
    }

    return { disallowed: false, notice: null };
  } catch {
    // Timeout, network error, parse error — don't block the scan
    return { disallowed: false, notice: null };
  }
}

/**
 * Parse robots.txt into rules for the wildcard (`*`) user-agent.
 * Only extracts Allow/Disallow directives for `User-agent: *`.
 */
function parseRobotsTxt(text: string): RobotsRule[] {
  const lines = text.split("\n").map((l) => l.trim());
  const rules: RobotsRule[] = [];
  let inWildcardBlock = false;

  for (const line of lines) {
    if (line.startsWith("#") || line === "") {
      continue;
    }

    const lower = line.toLowerCase();

    if (lower.startsWith("user-agent:")) {
      const agent = line.slice("user-agent:".length).trim();
      inWildcardBlock = agent === "*";
      continue;
    }

    if (!inWildcardBlock) continue;

    if (lower.startsWith("disallow:")) {
      const pattern = line.slice("disallow:".length).trim();
      if (pattern) {
        rules.push({ pattern, allow: false });
      }
    } else if (lower.startsWith("allow:")) {
      const pattern = line.slice("allow:".length).trim();
      if (pattern) {
        rules.push({ pattern, allow: true });
      }
    }
  }

  return rules;
}

/**
 * Check if a path matches any Disallow rule (respecting Allow overrides).
 * Uses longest-match-wins semantics per the robots.txt spec.
 */
function isDisallowed(path: string, rules: RobotsRule[]): boolean {
  let bestMatch: RobotsRule | null = null;
  let bestLen = -1;

  for (const rule of rules) {
    if (pathMatches(path, rule.pattern) && rule.pattern.length > bestLen) {
      bestMatch = rule;
      bestLen = rule.pattern.length;
    }
  }

  return bestMatch !== null && !bestMatch.allow;
}

/**
 * Simple robots.txt path matching. Supports:
 * - Prefix matching (default)
 * - `*` wildcard (matches any sequence)
 * - `$` end-of-string anchor
 */
function pathMatches(path: string, pattern: string): boolean {
  if (pattern === "/") return true;

  let anchored = false;
  let p = pattern;
  if (p.endsWith("$")) {
    anchored = true;
    p = p.slice(0, -1);
  }

  if (!p.includes("*")) {
    return anchored ? path === p : path.startsWith(p);
  }

  // Convert wildcard pattern to regex
  const escaped = p
    .split("*")
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const regex = new RegExp("^" + escaped + (anchored ? "$" : ""));
  return regex.test(path);
}
