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

/**
 * Detect the platform/CMS powering a page from raw HTML.
 *
 * Pure string matching — works with both Playwright `page.content()` and
 * BQL-fetched HTML. Detection signals are broad because managed hosting
 * often strips obvious markers.
 */
export function detectPlatformFromHtml(rawHtml: string): string | undefined {
  const html = rawHtml.toLowerCase();

  const matched = (...patterns: string[]) =>
    patterns.find((p) => html.includes(p));

  let platform: string | undefined;
  let signal: string | undefined;

  if (
    (signal = matched(
      'content="wordpress', "wp-content/", "wp-includes/",
      "wp-json", "wp-emoji", "wp-block-",
      "wordpress.com", "wpvip.com", "wordpress vip",
      "powered by wordpress",
    ))
  )
    platform = "wordpress";
  else if (
    (signal = matched(
      'content="drupal', "drupal.js", "/sites/default/files",
      "drupal.org", "drupal.settings", "data-drupal-",
      "/core/misc/drupal.js", "/modules/system/",
      "views-row", "field-name-",
    ))
  )
    platform = "drupal";
  else if (
    (signal = matched(
      'content="joomla', "/media/jui/", "/media/system/js/",
      "/components/com_", "/modules/mod_",
      "joomla!", "task=",
    ))
  )
    platform = "joomla";
  else if (
    (signal = matched(
      'content="ghost', "ghost.org", "ghost.io",
      "/ghost/api/", "ghost-portal", "ghost-search",
      "data-ghost-", "gh-head", "gh-portal",
      "powered by ghost",
    ))
  )
    platform = "ghost";
  else if (
    (signal = matched(
      "squarespace.com", "squarespace-cdn.com", "sqsp.net",
      "data-squarespace", "sqs-block", "sqs-layout",
      "sqs-announcement-bar", "sqs-slide-wrapper",
      "this is squarespace",
    ))
  )
    platform = "squarespace";
  else if (
    (signal = matched(
      "cdn.shopify.com", "myshopify.com",
      "shopify.theme", "shopify-section",
      "shopify-payment", "shopify-features",
      "data-shopify", "shopify-app",
    ))
  )
    platform = "shopify";
  else if (
    (signal = matched(
      "static.wixstatic.com", "parastorage.com",
      "wix.com", "wixsite.com",
      "x-wix-", "data-mesh-id",
      "wixui-", "wix-thunderbolt",
    ))
  )
    platform = "wix";
  else if (
    (signal = matched(
      "webflow.com", "website-files.com",
      "wf-design", "w-webflow-badge",
      "data-wf-site", "data-wf-page",
    ))
  )
    platform = "webflow";
  else if (
    (signal = matched(
      "js.hs-scripts.com", "hs-banner.com",
      ".hubspot.com", "hs-script-loader",
      "hubspot-topic", "hs-menu-wrapper",
      "data-hs-", "hs_cos_wrapper",
      "powered by hubspot",
    ))
  )
    platform = "hubspot";
  else if (
    (signal = matched(
      "weebly.com", "editmysite.com",
      "wsite-", "weebly-",
      "data-wsite-", "weeblycloud.com",
      "powered by weebly",
    ))
  )
    platform = "weebly";
  else if (
    (signal = matched('id="__next"', "__next_css__", "/_next/", "_next/static"))
  )
    platform = "nextjs";
  else if (
    (signal = matched('id="__nuxt"', "__nuxt_page", "/_nuxt/", "nuxt.config"))
  )
    platform = "nuxt";
  else if (
    (signal = matched('id="___gatsby"', "/gatsby-", "gatsby-image", "gatsby-plugin"))
  )
    platform = "gatsby";
  else if (
    (signal = matched("ng-version=", "ng-app", "ng-controller", "_ngcontent-"))
  )
    platform = "angular";
  else if (
    (signal = matched('id="remix-"', "__remix", "remix-run", 'data-remix'))
  )
    platform = "remix";
  else if (
    (signal = matched("astro-island", "astro-slot", "data-astro-"))
  )
    platform = "astro";
  else if (
    (signal = matched("data-reactroot", "data-reactid", "__react"))
  )
    platform = "react";
  else if (
    (signal = matched("data-v-", "__vue", "vue-app", 'id="app" data-v-'))
  )
    platform = "vue";
  else if (html.match(/class="[^"]*svelte-[a-z0-9]/)) {
    signal = "svelte class pattern";
    platform = "svelte";
  }

  if (platform) {
    console.log(`[Platform] Detected: ${platform} (matched "${signal}")`);
  }

  return platform;
}
