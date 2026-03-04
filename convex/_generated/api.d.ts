/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentPlan from "../agentPlan.js";
import type * as ai from "../ai.js";
import type * as audits from "../audits.js";
import type * as domainStrategies from "../domainStrategies.js";
import type * as lib_buildAgentPlanPrompt from "../lib/buildAgentPlanPrompt.js";
import type * as lib_dedup from "../lib/dedup.js";
import type * as lib_grading from "../lib/grading.js";
import type * as lib_groupViolations from "../lib/groupViolations.js";
import type * as scanStats from "../scanStats.js";
import type * as scanner from "../scanner.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentPlan: typeof agentPlan;
  ai: typeof ai;
  audits: typeof audits;
  domainStrategies: typeof domainStrategies;
  "lib/buildAgentPlanPrompt": typeof lib_buildAgentPlanPrompt;
  "lib/dedup": typeof lib_dedup;
  "lib/grading": typeof lib_grading;
  "lib/groupViolations": typeof lib_groupViolations;
  scanStats: typeof scanStats;
  scanner: typeof scanner;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
