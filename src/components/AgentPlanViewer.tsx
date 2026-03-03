"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { downloadAgentPlanZip } from "@/lib/create-agent-plan-zip";
import type { Components } from "react-markdown";

interface AgentPlanViewerProps {
  open: boolean;
  onClose: () => void;
  agentPlanUrl: string | null;
  domain: string;
}

function stripWrappingCodeFence(md: string): string {
  const trimmed = md.trim();
  const fenceRe = /^```[\w]*\n([\s\S]*?)\n```$/;
  const match = fenceRe.exec(trimmed);
  return match ? match[1] : trimmed;
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-display font-bold text-theme-primary mt-8 mb-4 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-display font-semibold text-theme-primary mt-7 mb-3">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-display font-semibold text-theme-primary mt-5 mb-2">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-base font-semibold text-theme-primary mt-4 mb-2">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="text-theme-secondary leading-relaxed mb-4">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-outside ml-5 mb-4 space-y-1.5 text-theme-secondary">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-outside ml-5 mb-4 space-y-1.5 text-theme-secondary">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent hover:underline transition-colors"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="text-sm font-mono text-theme-primary">{children}</code>
      );
    }
    return (
      <code className="text-sm font-mono bg-theme-tertiary px-1.5 py-0.5 rounded text-accent">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-theme-tertiary border border-theme rounded-xl p-4 mb-4 overflow-x-auto text-sm leading-relaxed text-theme-primary">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-accent pl-4 my-4 text-theme-muted italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-theme my-6" />,
  strong: ({ children }) => (
    <strong className="font-semibold text-theme-primary">{children}</strong>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-theme px-3 py-2 bg-theme-secondary text-left font-semibold text-theme-primary">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-theme px-3 py-2 text-theme-secondary">
      {children}
    </td>
  ),
};

type Tool = "cursor" | "claude-code" | "codex";

const CODE = "text-xs font-mono bg-theme-tertiary px-1 py-0.5 rounded text-accent";

const TOOL_INSTRUCTIONS: Record<
  Tool,
  { label: string; steps: React.ReactNode[] }
> = {
  cursor: {
    label: "Cursor",
    steps: [
      <>Copy the plan below or download the ZIP, then save as <code className={CODE}>AGENTS.md</code> in your project root.</>,
      <>Open your project in Cursor, switch to Agent mode, and prompt: <code className={CODE}>Follow the fix plan in AGENTS.md</code></>,
    ],
  },
  "claude-code": {
    label: "Claude Code",
    steps: [
      <>Copy the plan below or download the ZIP, then save as <code className={CODE}>.claude/CLAUDE.md</code> in your project root (create the folder if needed).</>,
      <>Run <code className={CODE}>claude</code> from your project directory and prompt: <code className={CODE}>Follow the fix plan in CLAUDE.md</code></>,
    ],
  },
  codex: {
    label: "Codex",
    steps: [
      <>Copy the plan below or download the ZIP, then save as <code className={CODE}>AGENTS.md</code> in your project root.</>,
      <>Open your project in Codex and prompt: <code className={CODE}>Follow the fix plan in AGENTS.md</code></>,
    ],
  },
};

function ToolInstructions() {
  const [activeTool, setActiveTool] = useState<Tool | null>(null);

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-theme-muted">
          How to use:
        </span>
        {(Object.keys(TOOL_INSTRUCTIONS) as Tool[]).map((tool) => (
          <button
            key={tool}
            onClick={() => setActiveTool(activeTool === tool ? null : tool)}
            className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors cursor-pointer ${
              activeTool === tool
                ? "border-[var(--accent-border)] bg-[var(--accent-bg)] text-accent"
                : "border-theme text-theme-muted hover:text-theme-secondary hover:border-[var(--accent-border)]"
            }`}
          >
            {TOOL_INSTRUCTIONS[tool].label}
          </button>
        ))}
      </div>
      {activeTool && (
        <ol className="mt-2.5 ml-5 list-decimal text-sm text-theme-secondary space-y-1">
          {TOOL_INSTRUCTIONS[activeTool].steps.map((step, i) => (
            <li key={i} className="leading-relaxed">
              {step}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function AgentPlanViewer({
  open,
  onClose,
  agentPlanUrl,
  domain,
}: AgentPlanViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open || !agentPlanUrl) return;
    if (markdown) return; // already loaded

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(agentPlanUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch (${r.status})`);
        return r.text();
      })
      .then((text) => {
        if (!cancelled) {
          setMarkdown(stripWrappingCodeFence(text));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message ?? "Failed to load fix plan");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, agentPlanUrl, markdown]);

  // Reset when URL changes (regeneration)
  useEffect(() => {
    setMarkdown(null);
  }, [agentPlanUrl]);

  const handleCopy = useCallback(async () => {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [markdown]);

  const handleDownload = useCallback(() => {
    if (!markdown) return;
    downloadAgentPlanZip({ agentPlanMd: markdown, siteDomain: domain });
  }, [markdown, domain]);

  const handleDialogCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-labelledby="agent-plan-viewer-title"
      className="m-auto rounded-2xl p-0 backdrop:bg-black/50 bg-[var(--bg-primary)] text-[var(--text-primary)] border border-theme max-w-3xl w-[calc(100%-2rem)] max-h-[85vh] shadow-xl"
      onCancel={handleDialogCancel}
    >
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-[var(--bg-primary)] border-b border-theme px-6 py-4 flex items-center justify-between gap-4 rounded-t-2xl">
        <div className="min-w-0">
          <h2
            id="agent-plan-viewer-title"
            className="text-lg font-display font-bold text-theme-primary truncate"
          >
            AGENTS.md — {domain}
          </h2>
          <p className="text-xs text-theme-muted mt-0.5">
            AI-generated fix plan for coding assistants
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {markdown && (
            <>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-theme bg-theme-secondary hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-theme bg-theme-secondary hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                ZIP
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-theme-tertiary text-theme-muted hover:text-theme-primary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6 overflow-y-auto" style={{ maxHeight: "calc(85vh - 5rem)" }}>
        {loading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-6 bg-theme-tertiary rounded w-2/3" />
            <div className="h-4 bg-theme-tertiary rounded w-full" />
            <div className="h-4 bg-theme-tertiary rounded w-5/6" />
            <div className="h-4 bg-theme-tertiary rounded w-4/6" />
            <div className="h-6 bg-theme-tertiary rounded w-1/2 mt-6" />
            <div className="h-4 bg-theme-tertiary rounded w-full" />
            <div className="h-4 bg-theme-tertiary rounded w-3/4" />
          </div>
        )}

        {error && (
          <div className="text-center py-8">
            <p className="text-[var(--severity-critical)] font-medium mb-2">
              Failed to load fix plan
            </p>
            <p className="text-sm text-theme-muted">{error}</p>
          </div>
        )}

        {markdown && (
          <>
            <ToolInstructions />
            <div className="agent-plan-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {markdown}
              </ReactMarkdown>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
