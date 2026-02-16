"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import { ThemeToggle } from "./ThemeToggle";
import { getNavLinks } from "@/lib/nav-links";

function LeafLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Stylized leaf */}
      <path d="M12 2C6.5 6 4 11 4 15c0 3.5 3.5 6 8 7 4.5-1 8-3.5 8-7 0-4-2.5-9-8-13z" />
      {/* Central vein */}
      <path d="M12 2v20" />
      {/* Side veins */}
      <path d="M12 8l-3 3" />
      <path d="M12 8l3 3" />
      <path d="M12 13l-4 3" />
      <path d="M12 13l4 3" />
    </svg>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { isSignedIn, isLoaded } = useAuth();

  // Dev-only emoji prefixes for quick visual distinction in the navbar
  const devEmojis: Record<string, string> = {
    "/demo": "🧪 ",
    "/test-error": "💥 ",
  };

  const navLinks = getNavLinks().map((link) => ({
    ...link,
    label: (devEmojis[link.href] ?? "") + link.label,
  }));

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 border-b border-theme bg-theme-nav backdrop-blur-xl transition-colors duration-300"
      aria-label="Main navigation"
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2.5 font-display text-xl font-semibold text-theme-primary hover:text-accent transition-colors"
            aria-label="A11y Garden — Home"
          >
            <LeafLogo className="w-7 h-7 text-accent" />
            <span className="hidden sm:inline">
              A11y Garden
            </span>
          </Link>

          {/* Navigation Links */}
          <ul className="flex items-center gap-1 list-none m-0 p-0">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive(link.href)
                      ? "bg-[var(--accent-bg)] text-accent font-semibold"
                      : "text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary"
                  }`}
                  aria-current={isActive(link.href) ? "page" : undefined}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          {/* Auth Buttons and Theme Toggle */}
          <div className="flex items-center gap-2">
            <ThemeToggle />

            {!isLoaded ? (
              <div
                className="w-8 h-8 rounded-full bg-theme-tertiary animate-pulse"
                aria-label="Loading authentication"
              />
            ) : isSignedIn ? (
              <>
                <Link
                  href="/dashboard"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive("/dashboard")
                      ? "bg-[var(--accent-bg)] text-accent font-semibold"
                      : "text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary"
                  }`}
                  aria-current={isActive("/dashboard") ? "page" : undefined}
                >
                  Dashboard
                </Link>
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: "w-9 h-9",
                    },
                  }}
                />
              </>
            ) : (
              <>
                <SignInButton mode="modal">
                  <button className="px-4 py-2 rounded-lg text-sm font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary transition-all duration-200 cursor-pointer">
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="btn-primary text-sm py-2 cursor-pointer">
                    Sign Up
                  </button>
                </SignUpButton>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
