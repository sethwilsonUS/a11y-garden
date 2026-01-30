import Link from "next/link";
import { GradeBadge } from "./GradeBadge";
import { Id } from "../../convex/_generated/dataModel";
import { calculateGrade, GRADING_VERSION } from "@/lib/grading";

interface AuditCardProps {
  audit: {
    _id: Id<"audits">;
    url: string;
    domain: string;
    pageTitle?: string;
    scannedAt: number;
    status: "pending" | "scanning" | "analyzing" | "complete" | "error";
    letterGrade: "A" | "B" | "C" | "D" | "F";
    score: number;
    gradingVersion?: number;
    violations: {
      critical: number;
      serious: number;
      moderate: number;
      minor: number;
      total: number;
    };
  };
}

export function AuditCard({ audit }: AuditCardProps) {
  const isComplete = audit.status === "complete";

  // Calculate correct grade on-the-fly if using outdated algorithm
  const { grade: displayGrade, score: displayScore } =
    audit.gradingVersion === GRADING_VERSION
      ? { grade: audit.letterGrade, score: audit.score }
      : calculateGrade(audit.violations);

  // Show domain + path so different pages on the same site are distinguishable
  const urlPath = (() => {
    try {
      const { pathname } = new URL(audit.url);
      return pathname !== "/" ? pathname.replace(/\/$/, "") : "";
    } catch {
      return "";
    }
  })();
  const displayDomain = audit.domain + urlPath;

  return (
    <Link
      href={`/results/${audit._id}`}
      className="block group"
    >
      <div className="garden-bed p-5 transition-all duration-200">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-semibold text-theme-primary truncate group-hover:text-accent transition-colors">
              {audit.pageTitle || displayDomain}
            </h3>
            <p className="text-sm text-theme-muted truncate mt-1">
              {displayDomain}
            </p>
            <p className="text-xs text-theme-muted mt-2">
              {new Date(audit.scannedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>

          {isComplete ? (
            <GradeBadge grade={displayGrade} score={displayScore} size="sm" />
          ) : (
            <div className="px-3 py-2 rounded-lg bg-theme-tertiary border border-theme">
              <span className="text-sm text-theme-secondary capitalize">
                {audit.status}
              </span>
            </div>
          )}
        </div>

        {isComplete && (
          <div className="flex gap-4 mt-4 pt-4 border-t border-theme">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[var(--severity-critical)]" aria-hidden="true" />
              <span className="text-xs text-theme-secondary">
                {audit.violations.critical} critical
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[var(--severity-serious)]" aria-hidden="true" />
              <span className="text-xs text-theme-secondary">
                {audit.violations.serious} serious
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[var(--severity-moderate)]" aria-hidden="true" />
              <span className="text-xs text-theme-secondary">
                {audit.violations.moderate + audit.violations.minor} other
              </span>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
