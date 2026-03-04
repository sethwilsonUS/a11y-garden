import { describe, it, expect } from "vitest";
import { detectAdaptiveServing } from "./adaptive-detect";

describe("detectAdaptiveServing", () => {
  it("detects m. subdomain", () => {
    const result = detectAdaptiveServing("<html></html>", "https://m.example.com");
    expect(result.detected).toBe(true);
    expect(result.reason).toContain("mobile subdomain");
  });

  it("detects mobile. subdomain", () => {
    const result = detectAdaptiveServing("<html></html>", "https://mobile.example.com/page");
    expect(result.detected).toBe(true);
  });

  it("detects mobi. subdomain", () => {
    const result = detectAdaptiveServing("<html></html>", "https://mobi.shop.com");
    expect(result.detected).toBe(true);
  });

  it("detects alternate media link", () => {
    const html = `<html><head>
      <link rel="alternate" media="only screen and (max-width: 640px)" href="/mobile">
    </head></html>`;
    const result = detectAdaptiveServing(html, "https://example.com");
    expect(result.detected).toBe(true);
    expect(result.reason).toContain("alternate media");
  });

  it("detects AMP alternate", () => {
    const html = `<html><head><link rel="amphtml" href="https://amp.example.com/page"></head></html>`;
    const result = detectAdaptiveServing(html, "https://example.com");
    expect(result.detected).toBe(true);
    expect(result.reason).toContain("AMP");
  });

  it("detects HandheldFriendly meta tag", () => {
    const html = `<html><head><meta name="HandheldFriendly" content="true"></head></html>`;
    const result = detectAdaptiveServing(html, "https://example.com");
    expect(result.detected).toBe(true);
    expect(result.reason).toContain("HandheldFriendly");
  });

  it("detects Vary: User-Agent meta tag", () => {
    const html = `<html><head><meta http-equiv="Vary" content="User-Agent"></head></html>`;
    const result = detectAdaptiveServing(html, "https://example.com");
    expect(result.detected).toBe(true);
    expect(result.reason).toContain("Vary");
  });

  it("returns not detected for responsive sites", () => {
    const html = `<html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
    </head><body><main>Hello</main></body></html>`;
    const result = detectAdaptiveServing(html, "https://example.com");
    expect(result.detected).toBe(false);
    expect(result.reason).toContain("responsive");
  });

  it("returns not detected for empty HTML", () => {
    const result = detectAdaptiveServing("", "https://example.com");
    expect(result.detected).toBe(false);
  });

  it("handles invalid URL gracefully", () => {
    const result = detectAdaptiveServing("<html></html>", "not-a-url");
    expect(result.detected).toBe(false);
  });

  it("does not false-positive on map. subdomain", () => {
    const result = detectAdaptiveServing("<html></html>", "https://map.example.com");
    expect(result.detected).toBe(false);
  });

  it("does not false-positive on mail. subdomain", () => {
    const result = detectAdaptiveServing("<html></html>", "https://mail.example.com");
    expect(result.detected).toBe(false);
  });
});
