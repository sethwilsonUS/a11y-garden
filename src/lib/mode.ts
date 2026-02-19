/**
 * App mode detection
 *
 * `npm run local` sets NEXT_PUBLIC_LOCAL_MODE=true so the app boots into a
 * lightweight, self-contained experience — no Convex, Clerk, or external
 * services required.  The flag is NEXT_PUBLIC_ so it's available in both
 * server and client code.
 */
export const isLocalMode = process.env.NEXT_PUBLIC_LOCAL_MODE === "true";
