/**
 * Server-side analytics tracking.
 *
 * For use in API routes and server actions.
 * No-ops in development unless NEXT_PUBLIC_ANALYTICS_DEBUG=true.
 */

import "server-only";
import { track as vercelTrackServer } from "@vercel/analytics/server";

type TrackData = Record<string, string | number | boolean | null>;

function shouldTrack(): boolean {
  if (process.env.NODE_ENV === "development") {
    return process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === "true";
  }
  return true;
}

/**
 * Track a custom event (server-side).
 * For API routes, server actions, etc.
 */
export async function trackServer(eventName: string, data?: TrackData): Promise<void> {
  if (!shouldTrack()) return;

  const provider = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER ?? "vercel";

  if (provider === "plausible") {
    // Plausible server-side API can be added when swapping providers
    return;
  }

  await vercelTrackServer(eventName, data);
}
