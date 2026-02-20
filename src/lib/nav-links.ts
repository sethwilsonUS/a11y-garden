import { isLocalMode } from "@/lib/mode";

export interface NavLink {
  href: string;
  label: string;
}

/**
 * Canonical navigation links shared between the Navbar and Footer.
 *
 * In local mode the nav is trimmed to what actually works without
 * Convex/Clerk — just the scanner (and dev-only pages).
 *
 * Dev-only pages (Demo, Error) are included only when NODE_ENV is
 * "development" so the two components stay in sync automatically.
 */
export function getNavLinks(): NavLink[] {
  if (isLocalMode) {
    const isDev = process.env.NODE_ENV === "development";
    return [
      { href: "/demo", label: "Scan" },
      ...(isDev ? [{ href: "/test-error", label: "Error" }] : []),
    ];
  }

  return [
    { href: "/", label: "Home" },
    { href: "/database", label: "Garden" },
  ];
}
