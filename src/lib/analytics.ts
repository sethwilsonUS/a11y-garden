/**
 * Client-side analytics tracking.
 *
 * Abstracts over Vercel Analytics (default) and Plausible for easy provider swap.
 * No-ops in development unless NEXT_PUBLIC_ANALYTICS_DEBUG=true.
 *
 * Do not track: scan URLs, search query text (privacy).
 */

import { track as vercelTrack } from "@vercel/analytics";

type TrackData = Record<string, string | number | boolean | null>;

function shouldTrack(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "development") {
    return process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === "true";
  }
  return true;
}

/**
 * Track a custom event (client-side).
 * Used by components in response to user actions.
 */
export function track(eventName: string, data?: TrackData): void {
  if (!shouldTrack()) return;

  const provider = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER ?? "vercel";

  if (provider === "plausible") {
    if (typeof window !== "undefined" && "plausible" in window) {
      (window as Window & { plausible: (name: string, opts?: { props: TrackData }) => void }).plausible(
        eventName,
        data ? { props: data } : undefined
      );
    }
    return;
  }

  vercelTrack(eventName, data);
}
