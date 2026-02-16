"use client";

import { useRef, useEffect } from "react";

interface SafeModeModalProps {
  open: boolean;
  onClose: () => void;
}

// What safe mode includes vs excludes, grouped for readability.
// Keep in sync with the `safeRules` array in src/app/api/scan/route.ts.
const includedCategories = [
  {
    name: "Images",
    rules: ["Alt text for images, inputs, and image maps"],
  },
  {
    name: "Forms",
    rules: ["Labels, associated fields, select names, button names"],
  },
  {
    name: "Links & Buttons",
    rules: ["Accessible names for links and buttons"],
  },
  {
    name: "Document Structure",
    rules: [
      "Page title, language attributes, heading hierarchy, skip navigation",
    ],
  },
  {
    name: "Tables",
    rules: ["Header associations and caption usage"],
  },
  {
    name: "ARIA (Core)",
    rules: [
      "Required attributes, valid roles & values, hidden-element conflicts",
    ],
  },
  {
    name: "Keyboard & Focus",
    rules: ["Tab index issues, focus order"],
  },
  {
    name: "Media",
    rules: ["Video and audio captions"],
  },
  {
    name: "Landmarks",
    rules: ["Main landmark present, content within landmarks"],
  },
  {
    name: "IDs",
    rules: ["Duplicate ID detection"],
  },
];

const excludedCategories = [
  {
    name: "Color & Contrast",
    rules: [
      "Color contrast ratios (AA & AAA)",
      "Links distinguishable from surrounding text",
    ],
  },
  {
    name: "List Structure",
    rules: ["Proper nesting of list elements (ul, ol, dl)"],
  },
  {
    name: "Frames & Iframes",
    rules: ["Frame titles, focusable content within frames"],
  },
  {
    name: "ARIA (Advanced Naming)",
    rules: [
      "Accessible names for dialogs, meters, progress bars, toggles, tooltips, tree items",
    ],
  },
  {
    name: "Interactive Elements",
    rules: [
      "Nested interactive controls",
      "Scrollable regions keyboard-accessible",
      "Touch target size (WCAG 2.2)",
    ],
  },
  {
    name: "Landmark Validation",
    rules: [
      "Landmarks at correct nesting level",
      "No duplicate banner/main/contentinfo",
      "Unique landmark labels",
    ],
  },
  {
    name: "Semantic Checks",
    rules: [
      "Paragraphs styled as headings",
      "SVG and role-img alt text",
      "Presentation role conflicts",
    ],
  },
  {
    name: "Forms (Advanced)",
    rules: ["Autocomplete attribute validation"],
  },
  {
    name: "Media (Advanced)",
    rules: ["Auto-playing audio detection"],
  },
];

function CheckIcon({ className }: { className?: string }) {
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
        d="M5 13l4 4L19 7"
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

export function SafeModeModal({ open, onClose }: SafeModeModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Sync the open prop with the native <dialog> API
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Close on native dialog close (Escape key, etc.)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  // Close when clicking the backdrop
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // The <dialog> element itself is the backdrop when using ::backdrop.
    // Clicks on the dialog element (not its children) = backdrop clicks.
    if (e.target === dialog) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="safe-mode-dialog"
      aria-labelledby="safe-mode-title"
    >
      <div className="safe-mode-dialog-content">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: "var(--severity-moderate-bg)",
                border: "1px solid var(--severity-moderate-border)",
              }}
            >
              <svg
                className="w-5 h-5"
                style={{ color: "var(--severity-moderate)" }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <div>
              <h2
                id="safe-mode-title"
                className="text-lg font-display font-bold text-theme-primary"
              >
                Safe Mode Details
              </h2>
              <p className="text-sm text-theme-muted">
                What was and wasn&apos;t tested
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-theme-tertiary hover:bg-[var(--border-color)] transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <XIcon className="w-4 h-4 text-theme-secondary" />
          </button>
        </div>

        {/* Explanation */}
        <p className="text-sm text-theme-secondary leading-relaxed mb-6">
          Some websites use complex DOM structures that cause certain
          accessibility checks to fail or time out. When this happens, A11y
          Garden automatically retries with a curated set of stable rules — we
          call this <strong className="text-theme-primary">Safe Mode</strong>.
          The results are still valuable, but not exhaustive.
        </p>

        {/* Two-column layout */}
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Included */}
          <div
            className="rounded-xl p-4 border"
            style={{
              backgroundColor: "var(--accent-bg)",
              borderColor: "var(--accent-border)",
            }}
          >
            <h3 className="text-sm font-semibold text-accent mb-3 flex items-center gap-2">
              <CheckIcon className="w-4 h-4" />
              Tested
            </h3>
            <ul className="space-y-2.5">
              {includedCategories.map((cat) => (
                <li key={cat.name}>
                  <p className="text-sm font-medium text-theme-primary">
                    {cat.name}
                  </p>
                  {cat.rules.map((rule) => (
                    <p
                      key={rule}
                      className="text-xs text-theme-muted leading-relaxed"
                    >
                      {rule}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </div>

          {/* Excluded */}
          <div
            className="rounded-xl p-4 border"
            style={{
              backgroundColor: "var(--severity-moderate-bg)",
              borderColor: "var(--severity-moderate-border)",
            }}
          >
            <h3
              className="text-sm font-semibold mb-3 flex items-center gap-2"
              style={{ color: "var(--severity-moderate)" }}
            >
              <XIcon className="w-4 h-4" />
              Not Tested
            </h3>
            <ul className="space-y-2.5">
              {excludedCategories.map((cat) => (
                <li key={cat.name}>
                  <p className="text-sm font-medium text-theme-primary">
                    {cat.name}
                  </p>
                  {cat.rules.map((rule) => (
                    <p
                      key={rule}
                      className="text-xs text-theme-muted leading-relaxed"
                    >
                      {rule}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-xs text-theme-muted mt-6 leading-relaxed text-center">
          Safe Mode runs {includedCategories.length} categories of checks out of{" "}
          {includedCategories.length + excludedCategories.length} total. For a
          comprehensive audit, consider pairing these results with manual
          testing.
        </p>
      </div>
    </dialog>
  );
}
