"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { downloadAgentPlanZip } from "@/lib/create-agent-plan-zip";
import { AgentPlanViewer } from "@/components/AgentPlanViewer";
import { ButtonCard } from "@/components/ButtonCard";
import { track } from "@/lib/analytics";

const CMS_PLATFORMS = new Set([
  "wordpress", "squarespace", "shopify", "wix", "webflow",
  "drupal", "joomla", "ghost", "hubspot", "weebly",
]);

interface AgentPlanButtonProps {
  auditId: Id<"audits">;
  platform: string | undefined;
  status: string;
  totalViolations: number;
  mobileTotalViolations: number;
  agentPlanFileId: string | undefined;
  domain: string;
  isOwner: boolean;
  isSignedIn: boolean;
  viewToken?: string | null;
}

const GRACE_PERIOD_MS = 60_000;

function AgentPlanButtonInner({
  auditId,
  platform,
  status,
  totalViolations,
  mobileTotalViolations,
  agentPlanFileId,
  domain,
  isOwner,
  isSignedIn,
  viewToken,
}: AgentPlanButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const graceTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const agentPlanUrl = useQuery(
    api.audits.getAgentPlanUrl,
    isSignedIn && isOwner
      ? {
          auditId,
          ...(viewToken ? { viewToken } : {}),
        }
      : "skip",
  );
  const generateAgentPlan = useAction(api.agentPlan.generateAgentPlan);
  const [prevFileId, setPrevFileId] = useState(agentPlanFileId);

  // React-recommended pattern: adjust state during render when a prop changes
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (agentPlanFileId !== prevFileId) {
    setPrevFileId(agentPlanFileId);
    if (agentPlanFileId) {
      if (isGenerating) {
        setIsGenerating(false);
        setViewerOpen(true);
      }
      setErrorMessage(null);
    }
  }

  // Clean up grace timeout when plan arrives
  useEffect(() => {
    if (agentPlanFileId && graceTimeoutRef.current) {
      clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = null;
    }
  }, [agentPlanFileId]);

  // Visibility gate — must come after all hooks
  if (
    !isSignedIn ||
    !isOwner ||
    !platform ||
    CMS_PLATFORMS.has(platform) ||
    status !== "complete" ||
    (totalViolations === 0 && mobileTotalViolations === 0)
  ) {
    return null;
  }

  const hasExistingPlan = !!agentPlanFileId;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    if (graceTimeoutRef.current) {
      clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = null;
    }
    track("Agent Plan Generate", { platform });

    try {
      const result = await generateAgentPlan({ auditId });
      if (result && typeof result === "object" && "success" in result) {
        if (!result.success && "error" in result) {
          setErrorMessage(result.error as string);
          setIsGenerating(false);
        }
      }
    } catch {
      // The action may still be completing server-side (e.g. client HTTP
      // timeout while OpenAI call finishes). Stay in "generating" state
      // and let the reactive subscription for agentPlanFileId resolve it.
      // Only show the error after a grace period with no result.
      graceTimeoutRef.current = setTimeout(() => {
        setErrorMessage("Failed to generate fix plan. Please try again.");
        setIsGenerating(false);
      }, GRACE_PERIOD_MS);
    }
  };

  const handleDownload = async () => {
    if (!agentPlanUrl) return;
    track("Agent Plan Download", { platform });

    try {
      const response = await fetch(agentPlanUrl);
      const agentPlanMd = await response.text();
      downloadAgentPlanZip({ agentPlanMd, siteDomain: domain });
    } catch {
      setErrorMessage("Failed to download fix plan.");
    }
  };

  const handleView = () => {
    track("Agent Plan View", { platform });
    setViewerOpen(true);
  };

  if (isGenerating) {
    return (
      <ButtonCard helperText="Building AGENTS.md for Cursor, Codex, and Claude Code...">
        <button
          disabled
          className="btn-secondary opacity-70 cursor-not-allowed"
          aria-busy="true"
        >
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Generating...
        </button>
      </ButtonCard>
    );
  }

  if (hasExistingPlan) {
    return (
      <ButtonCard>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleView}
            className="btn-secondary cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            View AGENTS.md
          </button>
          <button
            onClick={handleDownload}
            className="btn-secondary cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download ZIP
          </button>
          <button
            onClick={handleGenerate}
            className="text-sm text-theme-muted hover:text-accent transition-colors cursor-pointer underline"
          >
            Regenerate
          </button>
        </div>
        {errorMessage && (
          <p className="text-sm text-[var(--severity-critical)]" role="alert">
            {errorMessage}
          </p>
        )}
        <AgentPlanViewer
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
          agentPlanUrl={agentPlanUrl ?? null}
          domain={domain}
        />
      </ButtonCard>
    );
  }

  return (
    <ButtonCard helperText="Fix plan for Cursor, Codex, or Claude Code">
      <button
        onClick={handleGenerate}
        className="btn-secondary cursor-pointer"
        title="Generate an AGENTS.md fix plan for Cursor, Codex, or Claude Code"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
        Generate AGENTS.md
      </button>
      {errorMessage && (
        <p className="text-sm text-[var(--severity-critical)]" role="alert">
          {errorMessage}
        </p>
      )}
    </ButtonCard>
  );
}

// Error boundary: if AgentPlanButton crashes, render nothing instead of
// taking down the results page.
class AgentPlanBoundary extends React.Component<
  AgentPlanButtonProps,
  { hasError: boolean }
> {
  constructor(props: AgentPlanButtonProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[AgentPlanButton] Rendering error:", error);
  }

  render() {
    if (this.state.hasError) return null;
    return <AgentPlanButtonInner {...this.props} />;
  }
}

export function AgentPlanButton(props: AgentPlanButtonProps) {
  return <AgentPlanBoundary {...props} />;
}
