"use client";

import { ReactNode } from "react";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { dark } from "@clerk/themes";
import { useTheme } from "@/components/ThemeProvider";

// ---------------------------------------------------------------------------
// Graceful degradation: when Convex/Clerk env vars are missing we skip the
// providers entirely so the /demo page (and the scan API) can still work.
// A persistent banner warns the developer that the full stack isn't active.
// ---------------------------------------------------------------------------

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

const convex = CONVEX_URL ? new ConvexReactClient(CONVEX_URL) : null;

function MissingEnvBanner() {
  return (
    <div
      role="alert"
      className="fixed bottom-0 left-0 right-0 z-50 px-4 py-3 text-center text-sm font-medium border-t"
      style={{
        backgroundColor: "var(--severity-moderate-bg)",
        borderColor: "var(--severity-moderate-border)",
        color: "var(--severity-moderate)",
      }}
    >
      <span className="inline-flex items-center gap-2 flex-wrap justify-center">
        <svg
          className="w-4 h-4 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        Missing environment variables — auth, database, and AI features are
        disabled.{" "}
        <span className="text-theme-muted">
          See <code className="font-mono">.env.local.example</code> to configure.
        </span>
      </span>
    </div>
  );
}

function ClerkThemeWrapper({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <ClerkProvider
      appearance={{
        baseTheme: isDark ? dark : undefined,
        variables: {
          colorPrimary: isDark ? "#34d399" : "#047857",
          colorBackground: isDark ? "#1e1e1e" : "#f7f6f3",
          colorInputBackground: isDark ? "#2a2a2a" : "#efede8",
          colorInputText: isDark ? "#f0ede6" : "#1a1a1a",
        },
      }}
    >
      <ConvexProviderWithClerk client={convex!} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <>
        {children}
        <MissingEnvBanner />
      </>
    );
  }

  return <ClerkThemeWrapper>{children}</ClerkThemeWrapper>;
}
