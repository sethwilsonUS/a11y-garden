"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth, useUser } from "@clerk/nextjs";
import { AuditCard } from "@/components/AuditCard";
import { Id } from "../../../convex/_generated/dataModel";
import Link from "next/link";
import { redirect } from "next/navigation";
import { track } from "@/lib/analytics";

function DeleteConfirmDialog({
  auditDomain,
  open,
  onConfirm,
  onCancel,
}: {
  auditDomain: string;
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      cancelRef.current?.focus();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleClose = () => onCancel();
    el.addEventListener("close", handleClose);
    return () => el.removeEventListener("close", handleClose);
  }, [onCancel]);

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-desc"
      className="m-auto rounded-2xl p-0 backdrop:bg-black/50 bg-[var(--bg-primary)] border border-theme max-w-md w-[calc(100%-2rem)] shadow-xl"
      onCancel={onCancel}
    >
      <div className="p-6">
        <h2
          id="delete-dialog-title"
          className="text-lg font-display font-bold text-theme-primary mb-2"
        >
          Delete audit?
        </h2>
        <p id="delete-dialog-desc" className="text-sm text-theme-secondary mb-6">
          This will permanently delete the audit for{" "}
          <strong className="text-theme-primary">{auditDomain}</strong>. This
          action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="btn-secondary text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: "var(--severity-critical)" }}
          >
            Delete
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default function DashboardPage() {
  const { userId, isLoaded: authLoaded } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();

  const userAudits = useQuery(
    api.audits.getUserAudits,
    userId ? {} : "skip"
  );

  const deleteAudit = useMutation(api.audits.deleteAudit);
  const updateVisibility = useMutation(api.audits.updateAuditVisibility);

  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"audits">;
    domain: string;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);

  const showStatus = useCallback((msg: string) => {
    setStatusMessage(msg);
    const t = setTimeout(() => setStatusMessage(""), 4000);
    return () => clearTimeout(t);
  }, []);

  const handleToggleVisibility = useCallback(
    async (auditId: Id<"audits">, currentlyPublic: boolean) => {
      try {
        await updateVisibility({ auditId, isPublic: !currentlyPublic });
        track("Audit Visibility Toggle", {
          to: currentlyPublic ? "private" : "public",
        });
        showStatus(
          currentlyPublic
            ? "Audit changed to private"
            : "Audit changed to public"
        );
      } catch {
        showStatus("Failed to update visibility");
      }
    },
    [updateVisibility, showStatus]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteAudit({ auditId: deleteTarget.id });
      track("Audit Deleted");
      showStatus("Audit deleted");
    } catch {
      showStatus("Failed to delete audit");
    }
    setDeleteTarget(null);
  }, [deleteTarget, deleteAudit, showStatus]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteTarget(null);
    deleteButtonRef.current?.focus();
  }, []);

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
          {/* Live status region for action feedback */}
          <div aria-live="polite" className="sr-only" role="status">
            {statusMessage}
          </div>

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
                  <div key={audit._id} className="relative">
                    <AuditCard audit={audit} />
                    {/* Management controls */}
                    <div className="flex items-center justify-between mt-2 px-1">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md ${
                          audit.isPublic
                            ? "bg-[var(--accent-bg)] text-accent"
                            : "bg-theme-tertiary text-theme-muted"
                        }`}
                      >
                        {audit.isPublic ? (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            Public
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                            </svg>
                            Private
                          </>
                        )}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            handleToggleVisibility(audit._id, audit.isPublic)
                          }
                          aria-pressed={audit.isPublic}
                          aria-label={
                            audit.isPublic
                              ? `Make audit for ${audit.domain} private`
                              : `Make audit for ${audit.domain} public`
                          }
                          className="p-1.5 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-secondary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                        >
                          {audit.isPublic ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                        <button
                          ref={
                            deleteTarget?.id === audit._id
                              ? deleteButtonRef
                              : undefined
                          }
                          onClick={() =>
                            setDeleteTarget({
                              id: audit._id,
                              domain: audit.domain,
                            })
                          }
                          aria-label={`Delete audit for ${audit.domain}`}
                          className="p-1.5 rounded-lg text-theme-muted hover:text-[var(--severity-critical)] hover:bg-[var(--severity-critical-bg)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <DeleteConfirmDialog
            auditDomain={deleteTarget?.domain ?? ""}
            open={deleteTarget !== null}
            onConfirm={handleDeleteConfirm}
            onCancel={handleDeleteCancel}
          />
        </div>
      </div>
    </div>
  );
}
