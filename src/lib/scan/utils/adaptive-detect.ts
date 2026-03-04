/**
 * Detects whether a site uses adaptive serving (different HTML per device)
 * vs. responsive design (same HTML, CSS-only differences).
 *
 * When adaptive serving is detected, a separate BQL call with mobile
 * emulation is worthwhile because the HTML will genuinely differ.
 */

export interface AdaptiveSignal {
  detected: boolean;
  reason: string;
}

export function detectAdaptiveServing(html: string, url: string): AdaptiveSignal {
  try {
    const hostname = new URL(url).hostname;

    // 1. Mobile subdomain (m.example.com, mobile.example.com)
    if (/^(m|mobile|mobi)\./i.test(hostname)) {
      return { detected: true, reason: "mobile subdomain detected" };
    }
  } catch {
    // invalid URL — skip hostname check
  }

  // 2. Alternate mobile link: <link rel="alternate" media="...">
  if (/<link[^>]+rel=["']alternate["'][^>]+media=/i.test(html)) {
    return { detected: true, reason: "alternate media link found" };
  }

  // 3. AMP alternate: <link rel="amphtml"> suggests separate mobile version
  if (/rel=["']amphtml["']/i.test(html)) {
    return { detected: true, reason: "AMP alternate page detected" };
  }

  // 4. HandheldFriendly meta tag (legacy mobile indicator)
  if (/<meta[^>]+name=["']HandheldFriendly["']/i.test(html)) {
    return { detected: true, reason: "HandheldFriendly meta tag found" };
  }

  // 5. Dynamic serving hint via Vary: User-Agent in a meta tag
  //    Some sites embed this as <meta http-equiv="Vary" content="User-Agent">
  if (/<meta[^>]+http-equiv=["']Vary["'][^>]+content=["'][^"']*User-Agent/i.test(html)) {
    return { detected: true, reason: "Vary: User-Agent meta tag found" };
  }

  return { detected: false, reason: "responsive (no adaptive signals)" };
}
