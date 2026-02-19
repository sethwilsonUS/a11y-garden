import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getNavLinks } from "./nav-links";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getNavLinks", () => {
  describe("production mode", () => {
    it("returns Home and Garden links", () => {
      vi.stubEnv("NODE_ENV", "production");

      const links = getNavLinks();

      expect(links).toContainEqual({ href: "/", label: "Home" });
      expect(links).toContainEqual({ href: "/database", label: "Garden" });
    });

    it("does not include Demo link", () => {
      vi.stubEnv("NODE_ENV", "production");

      const links = getNavLinks();

      expect(links.find((l) => l.label === "Demo")).toBeUndefined();
    });

    it("does not include Error link", () => {
      vi.stubEnv("NODE_ENV", "production");

      const links = getNavLinks();

      expect(links.find((l) => l.label === "Error")).toBeUndefined();
    });

    it("returns exactly 2 links", () => {
      vi.stubEnv("NODE_ENV", "production");

      const links = getNavLinks();

      expect(links).toHaveLength(2);
    });
  });

  describe("development mode", () => {
    it("includes all production links", () => {
      vi.stubEnv("NODE_ENV", "development");

      const links = getNavLinks();

      expect(links).toContainEqual({ href: "/", label: "Home" });
      expect(links).toContainEqual({ href: "/database", label: "Garden" });
    });

    it("includes Demo link", () => {
      vi.stubEnv("NODE_ENV", "development");

      const links = getNavLinks();

      expect(links).toContainEqual({ href: "/demo", label: "Demo" });
    });

    it("includes Error link", () => {
      vi.stubEnv("NODE_ENV", "development");

      const links = getNavLinks();

      expect(links).toContainEqual({
        href: "/test-error",
        label: "Error",
      });
    });

    it("returns exactly 4 links", () => {
      vi.stubEnv("NODE_ENV", "development");

      const links = getNavLinks();

      expect(links).toHaveLength(4);
    });
  });

  describe("link structure", () => {
    it("every link has href and label", () => {
      vi.stubEnv("NODE_ENV", "development");

      const links = getNavLinks();

      for (const link of links) {
        expect(link).toHaveProperty("href");
        expect(link).toHaveProperty("label");
        expect(typeof link.href).toBe("string");
        expect(typeof link.label).toBe("string");
        expect(link.href.startsWith("/")).toBe(true);
      }
    });

    it("Home is the first link in web mode", () => {
      vi.stubEnv("NODE_ENV", "development");

      const links = getNavLinks();

      expect(links[0]).toEqual({ href: "/", label: "Home" });
    });
  });

  // =========================================================================
  // LOCAL MODE  (isLocalMode = true via mocked @/lib/mode)
  //
  // Because isLocalMode is a module-level constant we need vi.doMock +
  // dynamic import to swap in the mocked value for a fresh module.
  // =========================================================================

  describe("local mode", () => {
    // Reset the module cache BEFORE each test so the dynamic import
    // picks up the mocked @/lib/mode instead of the cached original.
    beforeEach(() => {
      vi.resetModules();
    });

    afterEach(() => {
      vi.doUnmock("@/lib/mode");
    });

    it("returns Scan link pointing to /demo", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.doMock("@/lib/mode", () => ({ isLocalMode: true }));
      const { getNavLinks: getLinks } = await import("./nav-links");

      const links = getLinks();

      expect(links).toContainEqual({ href: "/demo", label: "Scan" });
    });

    it("does not include Home or Garden", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.doMock("@/lib/mode", () => ({ isLocalMode: true }));
      const { getNavLinks: getLinks } = await import("./nav-links");

      const links = getLinks();

      expect(links.find((l) => l.label === "Home")).toBeUndefined();
      expect(links.find((l) => l.label === "Garden")).toBeUndefined();
    });

    it("returns exactly 1 link in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.doMock("@/lib/mode", () => ({ isLocalMode: true }));
      const { getNavLinks: getLinks } = await import("./nav-links");

      expect(getLinks()).toHaveLength(1);
    });

    it("includes Error link in development", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.doMock("@/lib/mode", () => ({ isLocalMode: true }));
      const { getNavLinks: getLinks } = await import("./nav-links");

      const links = getLinks();

      expect(links).toContainEqual({ href: "/test-error", label: "Error" });
    });

    it("returns exactly 2 links in development (Scan + Error)", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.doMock("@/lib/mode", () => ({ isLocalMode: true }));
      const { getNavLinks: getLinks } = await import("./nav-links");

      expect(getLinks()).toHaveLength(2);
    });

    it("Scan is the first link", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.doMock("@/lib/mode", () => ({ isLocalMode: true }));
      const { getNavLinks: getLinks } = await import("./nav-links");

      expect(getLinks()[0]).toEqual({ href: "/demo", label: "Scan" });
    });

    it("every link has href and label", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.doMock("@/lib/mode", () => ({ isLocalMode: true }));
      const { getNavLinks: getLinks } = await import("./nav-links");

      for (const link of getLinks()) {
        expect(link).toHaveProperty("href");
        expect(link).toHaveProperty("label");
        expect(typeof link.href).toBe("string");
        expect(typeof link.label).toBe("string");
        expect(link.href.startsWith("/")).toBe(true);
      }
    });
  });
});
