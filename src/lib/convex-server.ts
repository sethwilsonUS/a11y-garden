import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

/**
 * Create a server-side Convex HTTP client, optionally authenticated with a
 * Clerk JWT.  Returns null when CONVEX_URL is not configured (local/demo mode).
 */
export function getConvexClient(
  authToken?: string | null,
): ConvexHttpClient | null {
  if (!CONVEX_URL) return null;
  const client = new ConvexHttpClient(CONVEX_URL);
  if (authToken) client.setAuth(authToken);
  return client;
}
