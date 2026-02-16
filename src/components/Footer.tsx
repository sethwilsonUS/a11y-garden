import Link from "next/link";
import { getNavLinks } from "@/lib/nav-links";

function LeafIcon({ className }: { className?: string }) {
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
      <path d="M12 22V12" />
      <path d="M12 12C12 8 8 6 4 6c0 4 2 8 8 6" />
      <path d="M12 12c0-4 4-6 8-6-0 4-2 8-8 6" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-theme mt-auto">
      <div className="container mx-auto px-4 py-10">
        {/* Top row — branding + nav */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8">
          <div className="flex items-center gap-2 text-theme-secondary">
            <LeafIcon className="w-4 h-4 text-accent" />
            <span className="font-display font-medium text-sm">
              A11y Garden
            </span>
          </div>
          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-theme-muted">
              {getNavLinks().map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="hover:text-accent transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Divider */}
        <hr className="garden-divider" />

        {/* Disclaimer + credit */}
        <div className="pt-6 space-y-4 text-center">
          <p className="text-xs text-theme-muted leading-relaxed max-w-2xl mx-auto">
            A11y Garden provides automated accessibility testing powered by{" "}
            <a
              href="https://github.com/dequelabs/axe-core"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-accent transition-colors"
            >
              axe-core
            </a>
            . Results are not a substitute for a comprehensive WCAG audit, which
            requires manual testing and expert review. A passing grade does not
            guarantee WCAG 2.2 conformance.
          </p>
          <p className="text-xs text-theme-muted">
            Tended with care. Powered by axe-core &amp; OpenAI.
          </p>
        </div>
      </div>
    </footer>
  );
}
