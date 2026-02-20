"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { AuditCard } from "@/components/AuditCard";

type SortOption = "date" | "name" | "score";

function sortAudits<T extends { domain: string; scannedAt: number; score: number }>(
  audits: T[],
  sortBy: SortOption
): T[] {
  return [...audits].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return a.domain.localeCompare(b.domain);
      case "date":
        return b.scannedAt - a.scannedAt;
      case "score":
        return b.score - a.score;
      default:
        return 0;
    }
  });
}

function SeedlingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22V12" />
      <path d="M12 12C12 8 8 6 4 6c0 4 2 8 8 6" />
      <path d="M12 12c0-4 4-6 8-6-0 4-2 8-8 6" />
    </svg>
  );
}

export default function DatabasePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date");

  const publicAudits = useQuery(api.audits.getPublicAudits, {
    paginationOpts: { numItems: 200, cursor: null },
  });

  const auditsPage = publicAudits?.page;

  const displayAudits = useMemo(() => {
    if (!auditsPage) return undefined;

    // Deduplicate by full URL — keep only the latest audit per page
    const latestByUrl = new Map<string, (typeof auditsPage)[number]>();
    for (const audit of auditsPage) {
      const existing = latestByUrl.get(audit.url);
      if (!existing || audit.scannedAt > existing.scannedAt) {
        latestByUrl.set(audit.url, audit);
      }
    }
    const deduped = Array.from(latestByUrl.values());

    const trimmedSearch = searchTerm.trim().toLowerCase();

    const filtered = trimmedSearch
      ? deduped.filter((audit) =>
          audit.domain.toLowerCase().includes(trimmedSearch) ||
          audit.url.toLowerCase().includes(trimmedSearch)
        )
      : deduped;

    return sortAudits(filtered, sortBy);
  }, [auditsPage, searchTerm, sortBy]);

  return (
    <div className="min-h-screen overflow-x-hidden">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="max-w-4xl mx-auto mb-12">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--accent-bg)] border border-[var(--accent-border)] mb-6">
              <SeedlingIcon className="w-8 h-8 text-accent" />
            </div>
            <h1 className="text-4xl lg:text-5xl font-display font-bold text-theme-primary mb-4">
              Community Garden
            </h1>
            <p className="text-lg text-theme-secondary max-w-xl mx-auto leading-relaxed">
              Browse accessibility audits shared by the community. See how
              different websites are growing toward better accessibility.
            </p>
          </div>

          {/* Search */}
          <div className="relative max-w-xl mx-auto">
            <label htmlFor="garden-search" className="sr-only">Search audits by domain</label>
            <input
              type="text"
              id="garden-search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by domain (e.g., github or example.com)"
              className="w-full px-5 py-4 pl-12 bg-theme-secondary border border-theme rounded-xl text-theme-primary placeholder:text-theme-muted focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-all duration-200"
            />
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-primary transition-colors cursor-pointer"
                aria-label="Clear search"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="max-w-6xl mx-auto">
          {displayAudits === undefined ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-40 rounded-2xl skeleton" />
              ))}
            </div>
          ) : displayAudits.length === 0 ? (
            <div className="text-center py-16">
              <SeedlingIcon className="w-16 h-16 mx-auto mb-4 text-theme-muted" />
              <h2 className="text-xl font-display font-semibold text-theme-primary mb-2">
                {searchTerm ? "No results found" : "Nothing planted yet"}
              </h2>
              <p className="text-theme-muted">
                {searchTerm
                  ? `No audits found for "${searchTerm}"`
                  : "Be the first to scan a website and share it with the community!"}
              </p>
            </div>
          ) : (
            <>
              <h2 className="sr-only">Audit Results</h2>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <p className="text-sm text-theme-secondary">
                  {searchTerm ? (
                    <>
                      Showing {displayAudits.length} result
                      {displayAudits.length !== 1 ? "s" : ""} for &quot;{searchTerm}&quot;
                    </>
                  ) : (
                    <>
                      Showing {displayAudits.length} public audit
                      {displayAudits.length !== 1 ? "s" : ""}
                    </>
                  )}
                </p>

                {/* Sort Options */}
                <div className="flex items-center gap-2">
                  <label htmlFor="sort-select" className="text-sm text-theme-muted">
                    Sort by:
                  </label>
                  <select
                    id="sort-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="px-3 py-2 bg-theme-secondary border border-theme rounded-lg text-sm text-theme-primary focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-all duration-200 cursor-pointer"
                  >
                    <option value="date">Date (Newest)</option>
                    <option value="name">Name (A-Z)</option>
                    <option value="score">Score (Highest)</option>
                  </select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayAudits.map((audit) => (
                  <AuditCard key={audit._id} audit={audit} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Stats */}
        {publicAudits && publicAudits.page.length > 0 && !searchTerm && (
          <div className="max-w-4xl mx-auto mt-16 pt-8">
            <hr className="garden-divider" />
            <h2 className="text-xl font-display font-bold text-theme-primary text-center mb-8 mt-8">
              Garden Statistics
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl bg-theme-secondary border border-theme text-center">
                <div className="text-3xl font-display font-bold text-accent mb-1">
                  {publicAudits.page.length}
                </div>
                <div className="text-sm text-theme-muted">Total Audits</div>
              </div>
              <div className="p-5 rounded-xl bg-theme-secondary border border-theme text-center">
                <div className="text-3xl font-display font-bold text-accent mb-1">
                  {new Set(publicAudits.page.map((a) => a.domain)).size}
                </div>
                <div className="text-sm text-theme-muted">Unique Domains</div>
              </div>
              <div className="p-5 rounded-xl bg-theme-secondary border border-theme text-center">
                <div className="text-3xl font-display font-bold text-accent mb-1">
                  {publicAudits.page.filter((a) => a.letterGrade === "A").length}
                </div>
                <div className="text-sm text-theme-muted">Thriving (A)</div>
              </div>
              <div className="p-5 rounded-xl bg-theme-secondary border border-theme text-center">
                <div className="text-3xl font-display font-bold text-[var(--severity-critical)] mb-1">
                  {publicAudits.page.filter((a) => a.letterGrade === "F").length}
                </div>
                <div className="text-sm text-theme-muted">Need Care (F)</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
