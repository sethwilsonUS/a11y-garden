"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth, useUser } from "@clerk/nextjs";
import { AuditCard } from "@/components/AuditCard";
import Link from "next/link";
import { redirect } from "next/navigation";

export default function DashboardPage() {
  const { userId, isLoaded: authLoaded } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();

  const userAudits = useQuery(
    api.audits.getUserAudits,
    userId ? {} : "skip"
  );

  // Redirect to sign-in if not authenticated
  if (authLoaded && !userId) {
    redirect("/sign-in");
  }

  if (!authLoaded || !userLoaded) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-theme-tertiary rounded-lg w-1/3" />
              <div className="h-4 bg-theme-tertiary rounded w-1/2" />
              <div className="grid md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-40 bg-theme-tertiary rounded-xl" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const completedAudits = userAudits?.filter((a) => a.status === "complete") ?? [];
  const pendingAudits = userAudits?.filter((a) => a.status !== "complete" && a.status !== "error") ?? [];
  const averageScore = completedAudits.length > 0
    ? Math.round(
        completedAudits.reduce((sum, a) => sum + a.score, 0) /
          completedAudits.length
      )
    : 0;

  return (
    <div className="min-h-screen overflow-x-hidden">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-display font-bold text-theme-primary mb-2">
                Welcome back, {user?.firstName || "Gardener"}!
              </h1>
              <p className="text-theme-secondary">
                Tend your accessibility garden and track your progress.
              </p>
            </div>
            <Link href="/" className="btn-primary">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Scan
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
            <div className="p-5 garden-bed text-center">
              <div className="text-3xl font-display font-bold text-theme-primary mb-1">
                {userAudits?.length ?? 0}
              </div>
              <div className="text-sm text-theme-muted">Total Audits</div>
            </div>
            <div className="p-5 garden-bed text-center">
              <div className="text-3xl font-display font-bold text-accent mb-1">
                {completedAudits.length}
              </div>
              <div className="text-sm text-theme-muted">Completed</div>
            </div>
            <div className="p-5 garden-bed text-center">
              <div className="text-3xl font-display font-bold text-[var(--severity-minor)] mb-1">
                {pendingAudits.length}
              </div>
              <div className="text-sm text-theme-muted">In Progress</div>
            </div>
            <div className="p-5 garden-bed text-center">
              <div className="text-3xl font-display font-bold text-[var(--severity-moderate)] mb-1">
                {averageScore}
              </div>
              <div className="text-sm text-theme-muted">Avg. Score</div>
            </div>
          </div>

          {/* In Progress */}
          {pendingAudits.length > 0 && (
            <section className="mb-12">
              <h2 className="text-xl font-display font-bold text-theme-primary mb-4">
                Currently Growing
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingAudits.map((audit) => (
                  <AuditCard key={audit._id} audit={audit} />
                ))}
              </div>
            </section>
          )}

          {/* Your Audits */}
          <section>
            <h2 className="text-xl font-display font-bold text-theme-primary mb-4">
              Your Garden
            </h2>

            {userAudits === undefined ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-40 rounded-2xl skeleton" />
                ))}
              </div>
            ) : userAudits.length === 0 ? (
              <div className="text-center py-16 garden-bed">
                <svg className="w-16 h-16 mx-auto mb-4 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22V12" />
                  <path d="M12 12C12 8 8 6 4 6c0 4 2 8 8 6" />
                  <path d="M12 12c0-4 4-6 8-6-0 4-2 8-8 6" />
                </svg>
                <h3 className="text-xl font-display font-semibold text-theme-primary mb-2">
                  Your garden is empty
                </h3>
                <p className="text-theme-muted mb-6">
                  Plant your first seed by scanning a website!
                </p>
                <Link href="/" className="btn-primary">
                  Start Your First Scan
                </Link>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedAudits.map((audit) => (
                  <AuditCard key={audit._id} audit={audit} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
