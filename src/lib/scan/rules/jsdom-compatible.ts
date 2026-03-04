/**
 * JSDOM-compatible rule list.
 *
 * Re-exports STRUCTURAL_RULES and provides a Set for O(1) lookup.
 */

export { STRUCTURAL_RULES } from "./categories";
import { STRUCTURAL_RULES } from "./categories";

export const JSDOM_COMPATIBLE_RULE_SET = new Set<string>(STRUCTURAL_RULES);
