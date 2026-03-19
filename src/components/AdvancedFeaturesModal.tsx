"use client";

import { useEffect, useRef } from "react";

interface AdvancedFeaturesModalProps {
  open: boolean;
  onClose: () => void;
}

const advancedFeatures = [
  {
    title: "Comprehensive multi-engine scans",
    detail:
      "Run axe-core, HTML_CodeSniffer, and IBM ACE together, with lower-confidence issues separated into a review lane.",
  },
  {
    title: "Firewall bypass on protected sites",
    detail:
      "Authenticated accounts can use the more expensive bypass flow when a site is protected by a WAF or bot challenge.",
  },
  {
    title: "Saved and shareable audits",
    detail:
      "Keep scans in your dashboard and optionally publish them to the Community Garden.",
  },
  {
    title: "AGENTS.md fix plans",
    detail:
      "Generate an AI-ready AGENTS.md file for confirmed issues on developer-framework sites, designed for tools like Cursor, Codex, and Claude Code.",
  },
];

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zm7 12l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15zM5 14l.9 2.1L8 17l-2.1.9L5 20l-.9-2.1L2 17l2.1-.9L5 14z"
      />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

export function AdvancedFeaturesModal({
  open,
  onClose,
}: AdvancedFeaturesModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      lastFocusedRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      onClose();
      lastFocusedRef.current?.focus();
    };

    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (dialog && e.target === dialog) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="safe-mode-dialog"
      aria-labelledby="advanced-features-title"
      aria-describedby="advanced-features-desc"
    >
      <div className="safe-mode-dialog-content">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: "var(--accent-bg)",
                border: "1px solid var(--accent-border)",
              }}
            >
              <SparkIcon className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2
                id="advanced-features-title"
                className="text-lg font-display font-bold text-theme-primary"
              >
                Advanced Features
              </h2>
              <p className="text-sm text-theme-muted">
                Available after signing in
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-theme-tertiary hover:bg-[var(--border-color)] transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <XIcon className="w-4 h-4 text-theme-secondary" />
          </button>
        </div>

        <p
          id="advanced-features-desc"
          className="text-sm text-theme-secondary leading-relaxed mb-6"
        >
          Signed-in accounts unlock the higher-cost parts of A11y Garden while
          logged-out scans stay on the fast, strict axe-core baseline.
        </p>

        <ul className="space-y-3 list-none m-0 p-0">
          {advancedFeatures.map((feature) => (
            <li
              key={feature.title}
              className="rounded-xl border border-theme bg-theme-secondary p-4"
            >
              <p className="font-semibold text-theme-primary">
                {feature.title}
              </p>
              <p className="text-sm text-theme-secondary mt-1">
                {feature.detail}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
