import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep axe-core out of the webpack bundle so that `axe.source` contains the
  // original, browser-safe IIFE.  When webpack bundles axe-core it replaces
  // `typeof module` with a literal "object", which breaks the guard around
  // `module.exports` and causes a ReferenceError when the source string is
  // evaluated inside a browser page via Playwright.
  serverExternalPackages: ["axe-core"],
};

export default nextConfig;
