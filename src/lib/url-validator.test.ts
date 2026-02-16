import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateUrl } from "./url-validator";

// Mock dns/promises so we don't make real DNS lookups
vi.mock("dns/promises", () => ({
  lookup: vi.fn(),
}));

import { lookup } from "dns/promises";
const mockedLookup = vi.mocked(lookup);

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("validateUrl", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // SCHEME VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("scheme validation", () => {
    it("accepts http URLs", async () => {
      mockedLookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });

      const result = await validateUrl("http://example.com");

      expect(result.ok).toBe(true);
    });

    it("accepts https URLs", async () => {
      mockedLookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });

      const result = await validateUrl("https://example.com");

      expect(result.ok).toBe(true);
    });

    it("rejects ftp URLs", async () => {
      const result = await validateUrl("ftp://example.com");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("Only http and https");
        expect(result.reason).toContain("ftp");
      }
    });

    it("rejects javascript: URLs", async () => {
      // URL constructor may throw for javascript: — that's fine, handled as invalid
      const result = await validateUrl("javascript:alert(1)");

      expect(result.ok).toBe(false);
    });

    it("rejects file: URLs", async () => {
      const result = await validateUrl("file:///etc/passwd");

      expect(result.ok).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INVALID URLS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("invalid URLs", () => {
    it("rejects empty string", async () => {
      const result = await validateUrl("");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("Invalid URL");
      }
    });

    it("rejects nonsense strings", async () => {
      const result = await validateUrl("not a url at all");

      expect(result.ok).toBe(false);
    });

    it("rejects URLs without hostname", async () => {
      const result = await validateUrl("http://");

      expect(result.ok).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DNS RESOLUTION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("DNS resolution", () => {
    it("resolves valid hostnames and returns normalized URL", async () => {
      mockedLookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });

      const result = await validateUrl("https://example.com/path?q=1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe("https://example.com/path?q=1");
      }
    });

    it("returns error for unresolvable hostnames", async () => {
      mockedLookup.mockRejectedValue(
        new Error("getaddrinfo ENOTFOUND nope.invalid"),
      );

      const result = await validateUrl("https://nope.invalid");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("Could not resolve hostname");
        expect(result.reason).toContain("nope.invalid");
      }
    });

    it("allows through on non-ENOTFOUND DNS errors", async () => {
      // Other DNS errors (timeout, etc.) — let Playwright handle it
      mockedLookup.mockRejectedValue(new Error("DNS timeout"));

      const result = await validateUrl("https://slow-dns.example.com");

      expect(result.ok).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SSRF PROTECTION (PRODUCTION)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("SSRF protection in production", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("blocks localhost (127.0.0.1)", async () => {
      mockedLookup.mockResolvedValue({ address: "127.0.0.1", family: 4 });

      const result = await validateUrl("https://localhost");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("private or reserved IP");
      }
    });

    it("blocks 10.x.x.x private range", async () => {
      mockedLookup.mockResolvedValue({ address: "10.0.0.1", family: 4 });

      const result = await validateUrl("https://internal.corp");

      expect(result.ok).toBe(false);
    });

    it("blocks 192.168.x.x private range", async () => {
      mockedLookup.mockResolvedValue({ address: "192.168.1.1", family: 4 });

      const result = await validateUrl("https://router.local");

      expect(result.ok).toBe(false);
    });

    it("blocks 172.16.x.x private range", async () => {
      mockedLookup.mockResolvedValue({ address: "172.16.0.1", family: 4 });

      const result = await validateUrl("https://docker.local");

      expect(result.ok).toBe(false);
    });

    it("blocks link-local addresses (169.254.x.x)", async () => {
      mockedLookup.mockResolvedValue({ address: "169.254.169.254", family: 4 });

      const result = await validateUrl("https://metadata.cloud");

      expect(result.ok).toBe(false);
    });

    it("allows public IP addresses", async () => {
      mockedLookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });

      const result = await validateUrl("https://example.com");

      expect(result.ok).toBe(true);
    });

    it("blocks IPv6 loopback (::1)", async () => {
      const result = await validateUrl("https://[::1]:3000");

      expect(result.ok).toBe(false);
    });

    it("blocks IPv6 unique local (fc00::)", async () => {
      mockedLookup.mockResolvedValue({
        address: "fc00::1",
        family: 6,
      });

      const result = await validateUrl("https://ipv6-internal.local");

      expect(result.ok).toBe(false);
    });

    it("blocks IPv4-mapped IPv6 addresses (::ffff:192.168.1.1)", async () => {
      mockedLookup.mockResolvedValue({
        address: "::ffff:192.168.1.1",
        family: 6,
      });

      const result = await validateUrl("https://mapped-ipv4.local");

      expect(result.ok).toBe(false);
    });

    it("also blocks IPv4-mapped IPv6 with public IP (conservative)", async () => {
      // The :: prefix check catches ::ffff: before the mapped-IPv4 handler
      // runs. This is overly conservative but errs on the safe side.
      mockedLookup.mockResolvedValue({
        address: "::ffff:93.184.216.34",
        family: 6,
      });

      const result = await validateUrl("https://mapped-public.example.com");

      expect(result.ok).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DEVELOPMENT MODE (PRIVATE IPS ALLOWED)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("development mode (private IPs allowed)", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("allows localhost in development", async () => {
      mockedLookup.mockResolvedValue({ address: "127.0.0.1", family: 4 });

      const result = await validateUrl("https://localhost:3000");

      expect(result.ok).toBe(true);
    });

    it("allows private IPs in development", async () => {
      mockedLookup.mockResolvedValue({ address: "192.168.1.100", family: 4 });

      const result = await validateUrl("https://my-dev-server.local");

      expect(result.ok).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // URL NORMALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("URL normalization", () => {
    it("returns the parsed/normalized URL on success", async () => {
      mockedLookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });

      const result = await validateUrl("HTTPS://EXAMPLE.COM/Path");

      expect(result.ok).toBe(true);
      if (result.ok) {
        // URL constructor normalizes scheme and hostname to lowercase
        expect(result.url).toBe("https://example.com/Path");
      }
    });

    it("preserves query parameters", async () => {
      mockedLookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });

      const result = await validateUrl(
        "https://example.com/search?q=test&page=1",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toContain("q=test");
        expect(result.url).toContain("page=1");
      }
    });

    it("handles IP literal URLs", async () => {
      const result = await validateUrl("http://93.184.216.34");

      // In non-production, this should pass (no private IP check)
      expect(result.ok).toBe(true);
    });
  });
});
