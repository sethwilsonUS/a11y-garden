"use client";

import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      className="relative p-2.5 rounded-xl bg-theme-secondary border border-theme hover:border-[var(--accent-border)] transition-all duration-300 group cursor-pointer"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      type="button"
    >
      {/* Sun Icon — visible in dark mode (click to go light) */}
      <svg
        className={`w-5 h-5 transition-all duration-300 ${
          isDark
            ? "text-[var(--accent)] rotate-0 scale-100"
            : "text-[var(--accent)] -rotate-90 scale-0 absolute inset-2.5"
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" strokeWidth={2} />
        <path
          strokeLinecap="round"
          strokeWidth={2}
          d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
        />
      </svg>

      {/* Moon Icon — visible in light mode (click to go dark) */}
      <svg
        className={`w-5 h-5 transition-all duration-300 ${
          isDark
            ? "text-[var(--accent)] rotate-90 scale-0 absolute inset-2.5"
            : "text-[var(--accent)] rotate-0 scale-100"
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
        />
      </svg>

      {/* Visible label for screen readers */}
      <span className="sr-only">
        {isDark ? "Switch to light mode" : "Switch to dark mode"}
      </span>
    </button>
  );
}
