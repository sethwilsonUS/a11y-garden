"use client";

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught rendering error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="garden-bed max-w-lg w-full p-8 text-center">
          {/* Wilted seedling icon */}
          <div className="mb-6" aria-hidden="true">
            <svg
              width="64"
              height="64"
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="mx-auto"
              style={{ color: "var(--accent)" }}
            >
              <circle
                cx="32"
                cy="32"
                r="30"
                stroke="currentColor"
                strokeWidth="2"
                opacity="0.15"
              />
              <path
                d="M32 48V28"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                d="M32 28c-4-8-14-8-14-2s8 10 14 2z"
                fill="currentColor"
                opacity="0.25"
              />
              <path
                d="M32 32c4-6 12-5 12-1s-6 7-12 1z"
                fill="currentColor"
                opacity="0.2"
              />
              <line
                x1="24"
                y1="52"
                x2="40"
                y2="52"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.3"
              />
            </svg>
          </div>

          <h1 className="font-display text-2xl text-theme-primary mb-2">
            Something went wrong
          </h1>
          <p className="text-theme-muted mb-6 text-sm leading-relaxed">
            An unexpected error occurred while rendering this page. You can try
            again, or head back to the home page.
          </p>

          {process.env.NODE_ENV === "development" && this.state.error && (
            <pre className="font-mono text-xs text-left p-4 mb-6 rounded-lg overflow-auto max-h-40"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--severity-critical)",
              }}
            >
              {this.state.error.message}
            </pre>
          )}

          <div className="flex items-center justify-center gap-3">
            <button onClick={this.handleReset} className="btn-primary">
              Try again
            </button>
            <a href="/" className="btn-secondary">
              Go home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
