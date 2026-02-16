export interface NavLink {
  href: string;
  label: string;
}

/**
 * Canonical navigation links shared between the Navbar and Footer.
 *
 * Dev-only pages (Demo, Error) are included only when NODE_ENV is
 * "development" so the two components stay in sync automatically.
 */
export function getNavLinks(): NavLink[] {
  const isDev = process.env.NODE_ENV === "development";

  return [
    { href: "/", label: "Home" },
    { href: "/database", label: "Garden" },
    ...(isDev
      ? [
          { href: "/demo", label: "Demo" },
          { href: "/test-error", label: "Error" },
        ]
      : []),
  ];
}
