/**
 * Platform / CMS / framework display labels and confidence levels.
 *
 * Shared between the scanner (server-side detection) and the client
 * (results page badge, AI prompt).  Keep this file free of Node-only
 * imports so it can be used in both environments.
 */

export const CMS_PLATFORMS = new Set([
  "wordpress", "squarespace", "shopify", "wix", "webflow",
  "drupal", "joomla", "ghost", "hubspot", "weebly",
]);

export const PLATFORM_LABELS: Record<string, string> = {
  // CMS platforms
  wordpress: "WordPress",
  squarespace: "Squarespace",
  shopify: "Shopify",
  wix: "Wix",
  webflow: "Webflow",
  drupal: "Drupal",
  joomla: "Joomla",
  ghost: "Ghost",
  hubspot: "HubSpot",
  weebly: "Weebly",
  // Meta-frameworks (high confidence)
  nextjs: "Next.js",
  nuxt: "Nuxt",
  gatsby: "Gatsby",
  angular: "Angular",
  remix: "Remix",
  astro: "Astro",
  // Base libraries (medium confidence)
  react: "React",
  vue: "Vue",
  svelte: "Svelte",
};

/**
 * Detection confidence level for each platform slug.
 *
 * - "high"   -- CMS platforms and meta-frameworks with unique, unmistakable
 *               markers in the rendered HTML.
 * - "medium" -- Base JS libraries detected via DOM heuristics that can
 *               occasionally appear on non-matching sites (e.g. a React
 *               widget embedded in an otherwise non-React page).
 *
 * Slugs not in this map default to "high" (all legacy CMS platforms).
 */
export const PLATFORM_CONFIDENCE: Record<string, "high" | "medium"> = {
  react: "medium",
  vue: "medium",
  svelte: "medium",
};

/** Return the confidence level for a platform slug ("high" if not in map). */
export function getPlatformConfidence(
  slug: string | undefined,
): "high" | "medium" {
  if (!slug) return "high";
  return PLATFORM_CONFIDENCE[slug] ?? "high";
}
