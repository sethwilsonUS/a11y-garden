/**
 * Platform / CMS display labels.
 *
 * Shared between the scanner (server-side detection) and the client
 * (results page badge, AI prompt).  Keep this file free of Node-only
 * imports so it can be used in both environments.
 */

export const PLATFORM_LABELS: Record<string, string> = {
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
};
