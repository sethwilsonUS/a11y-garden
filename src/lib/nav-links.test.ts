import { describe, it, expect, vi, afterEach } from "vitest";
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

    it("Home is always the first link", () => {
      vi.stubEnv("NODE_ENV", "development");

      const links = getNavLinks();

      expect(links[0]).toEqual({ href: "/", label: "Home" });
    });
  });
});
