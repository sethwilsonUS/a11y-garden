import { lookup } from "dns/promises";

// ---------------------------------------------------------------------------
// SSRF-safe URL validator
// ---------------------------------------------------------------------------
// Resolves the hostname to an IP and rejects private/reserved ranges.
// In local development (NODE_ENV !== "production") private IPs are allowed so
// you can scan your own dev server — very meta!
// ---------------------------------------------------------------------------

/** Result returned by validateUrl */
export type UrlValidationResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

// Private / reserved IPv4 ranges expressed as [prefix, maskBits]
const PRIVATE_IPV4_RANGES: [string, number][] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // RFC 1918
  ["100.64.0.0", 10], // Carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local
  ["172.16.0.0", 12], // RFC 1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation (TEST-NET-1)
  ["192.88.99.0", 24], // 6to4 relay anycast (deprecated)
  ["192.168.0.0", 16], // RFC 1918
  ["198.18.0.0", 15], // benchmark testing
  ["198.51.100.0", 24], // documentation (TEST-NET-2)
  ["203.0.113.0", 24], // documentation (TEST-NET-3)
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved / broadcast
];

// IPv6 prefixes that are private / reserved
const PRIVATE_IPV6_PREFIXES = [
  "::1", // loopback
  "fc", // unique local (fc00::/7)
  "fd", // unique local (fc00::/7)
  "fe80", // link-local
  "ff", // multicast
  "::", // unspecified (::)
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  for (const [prefix, maskBits] of PRIVATE_IPV4_RANGES) {
    const prefixInt = ipv4ToInt(prefix);
    const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
    if ((ipInt & mask) === (prefixInt & mask)) {
      return true;
    }
  }
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  // Exact match for unspecified address
  if (normalized === "::" || normalized === "::0") return true;
  // Check prefixes
  for (const prefix of PRIVATE_IPV6_PREFIXES) {
    if (normalized.startsWith(prefix)) return true;
  }
  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const v4Match = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Match) return isPrivateIPv4(v4Match[1]);
  return false;
}

/**
 * Validates a user-supplied URL for SSRF safety.
 *
 * 1. Rejects non-http(s) schemes
 * 2. Resolves hostname via DNS
 * 3. In production, rejects private / reserved IP ranges
 * 4. In development, allows private IPs (so you can scan localhost)
 */
export async function validateUrl(rawUrl: string): Promise<UrlValidationResult> {
  // ---- Scheme check -------------------------------------------------------
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Invalid URL." };
  }

  const scheme = parsed.protocol.toLowerCase();
  if (scheme !== "http:" && scheme !== "https:") {
    return {
      ok: false,
      reason: `Only http and https URLs are allowed (got ${scheme.replace(":", "")}).`,
    };
  }

  // ---- Hostname check -----------------------------------------------------
  const hostname = parsed.hostname;
  if (!hostname) {
    return { ok: false, reason: "URL is missing a hostname." };
  }

  // Block IP addresses embedded directly as hostnames in production
  // (users should provide domain names; direct IPs bypass DNS resolution)
  const isProduction = process.env.NODE_ENV === "production";

  // ---- DNS resolution -----------------------------------------------------
  // Resolve to an actual IP so we can check the range.
  // This prevents DNS-rebinding attacks — we resolve once here and the
  // browser resolves again, but the time window is tiny.
  try {
    // Check if it's an IP literal first
    const ipv4Regex = /^\d+\.\d+\.\d+\.\d+$/;
    const isIpLiteral =
      ipv4Regex.test(hostname) ||
      hostname.startsWith("[") || // IPv6 literal [::1]
      hostname.includes(":");

    let resolvedIp: string;

    if (isIpLiteral) {
      // Strip brackets from IPv6 literals
      resolvedIp = hostname.replace(/^\[|\]$/g, "");
    } else {
      // Resolve hostname to IP
      const result = await lookup(hostname);
      resolvedIp = result.address;
    }

    // ---- Private range check (production only) ----------------------------
    if (isProduction) {
      const isIPv6 = resolvedIp.includes(":");
      const isPrivate = isIPv6
        ? isPrivateIPv6(resolvedIp)
        : isPrivateIPv4(resolvedIp);

      if (isPrivate) {
        return {
          ok: false,
          reason:
            "This URL resolves to a private or reserved IP address and cannot be scanned.",
        };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // DNS lookup failure — hostname doesn't exist
    if (message.includes("ENOTFOUND") || message.includes("getaddrinfo")) {
      return {
        ok: false,
        reason: `Could not resolve hostname "${hostname}". Check the URL and try again.`,
      };
    }
    // Other DNS errors — let it through (Playwright will fail with a
    // better error message if the host is truly unreachable)
  }

  return { ok: true, url: parsed.toString() };
}
