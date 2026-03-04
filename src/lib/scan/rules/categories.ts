/**
 * axe-core rule categories for scan mode reporting.
 *
 * Used to build ScanModeInfo.skippedCategories — tells users exactly which
 * rules ran and which were skipped (and why) in each scan mode.
 */

/** Rules that require getComputedStyle / CSS cascade (JSDOM cannot provide). */
export const CSS_DEPENDENT_RULES = [
  "color-contrast",
  "color-contrast-enhanced",
  "link-in-text-block",
  "target-size",
] as const;

/** Rules that require live browser interaction (scroll, focus, hover). */
export const LIVE_BROWSER_RULES = [
  "scrollable-region-focusable",
  "nested-interactive",
  "focus-order-semantics",
] as const;

/** Rules that work on static DOM structure — safe for JSDOM. */
export const STRUCTURAL_RULES = [
  // Images
  "image-alt",
  "image-redundant-alt",
  "input-image-alt",
  "area-alt",
  // Forms
  "label",
  "form-field-multiple-labels",
  "select-name",
  "input-button-name",
  // Links & buttons
  "link-name",
  "button-name",
  // Document structure
  "document-title",
  "html-has-lang",
  "html-lang-valid",
  "valid-lang",
  "page-has-heading-one",
  "bypass",
  // Tables
  "td-headers-attr",
  "th-has-data-cells",
  "table-fake-caption",
  // Semantic structure
  "landmark-one-main",
  "region",
  "heading-order",
  "empty-heading",
  "duplicate-id",
  "duplicate-id-active",
  "duplicate-id-aria",
  // ARIA
  "aria-allowed-attr",
  "aria-hidden-body",
  "aria-hidden-focus",
  "aria-required-attr",
  "aria-required-children",
  "aria-required-parent",
  "aria-roles",
  "aria-valid-attr",
  "aria-valid-attr-value",
  // Focus & keyboard (structural checks only)
  "tabindex",
  // Media
  "video-caption",
  "audio-caption",
  // Misc
  "meta-viewport",
  "meta-refresh",
  "blink",
  "marquee",
  "server-side-image-map",
] as const;

// ---------------------------------------------------------------------------
// Human-readable category metadata for skip reporting
// ---------------------------------------------------------------------------

export interface RuleCategoryMeta {
  name: string;
  reason: string;
  ruleIds: readonly string[];
}

export const CSS_CATEGORY: RuleCategoryMeta = {
  name: "Color & contrast",
  reason: "Requires CSS computation (not available in server-side scan)",
  ruleIds: CSS_DEPENDENT_RULES,
};

export const LIVE_BROWSER_CATEGORY: RuleCategoryMeta = {
  name: "Interactive elements",
  reason: "Requires live browser interaction",
  ruleIds: LIVE_BROWSER_RULES,
};

/**
 * Categories skipped when running in safe-rules mode (in-browser fallback).
 * Reason text is overridden per-use since the cause varies (crash, timeout, etc.)
 */
export const SAFE_MODE_SKIPPED_CATEGORIES: RuleCategoryMeta[] = [
  {
    name: "Color & contrast",
    reason: "Caused scan crash on this site",
    ruleIds: CSS_DEPENDENT_RULES,
  },
  {
    name: "Interactive elements",
    reason: "Excluded from safe rule set",
    ruleIds: LIVE_BROWSER_RULES,
  },
];

/** Categories skipped when running in JSDOM structural mode. */
export const JSDOM_SKIPPED_CATEGORIES: RuleCategoryMeta[] = [
  { ...CSS_CATEGORY },
  { ...LIVE_BROWSER_CATEGORY },
];
