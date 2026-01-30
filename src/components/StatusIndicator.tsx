"use client";

interface StatusIndicatorProps {
  status: "pending" | "scanning" | "analyzing" | "complete" | "error";
}

const statusConfig = {
  pending: {
    label: "Queued",
    description: "Getting ready to plant the seeds of your audit...",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  scanning: {
    label: "Scanning",
    description: "Examining your site for accessibility issues...",
    icon: (
      <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    ),
  },
  analyzing: {
    label: "Analyzing",
    description: "AI is cultivating insights from your results...",
    icon: (
      <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  complete: {
    label: "Complete",
    description: "Your accessibility report is ready to harvest!",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  error: {
    label: "Error",
    description: "Something went wrong during the scan",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
};

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const config = statusConfig[status];

  return (
    <div
      className="flex items-center gap-4 p-6 rounded-xl bg-[var(--accent-bg)] border border-[var(--accent-border)]"
      role="status"
      aria-live="polite"
    >
      <div className="text-accent">{config.icon}</div>
      <div>
        <div className="font-display font-semibold text-accent">{config.label}</div>
        <div className="text-sm text-theme-secondary">{config.description}</div>
      </div>
    </div>
  );
}
