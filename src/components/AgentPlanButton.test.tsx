// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AgentPlanButton } from "./AgentPlanButton";
import type { Id } from "../../convex/_generated/dataModel";

// ═══════════════════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════════════════

const mockUseQuery = vi.fn();
const mockUseAction = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useAction: (...args: unknown[]) => mockUseAction(...args),
}));

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
}));

const AUDIT_ID = "test-audit-123" as Id<"audits">;

function makeAuditProps(overrides: Record<string, unknown> = {}) {
  return {
    auditId: AUDIT_ID,
    platform: "nextjs" as string | undefined,
    status: "complete" as string,
    totalViolations: 5,
    mobileTotalViolations: 3,
    agentPlanFileId: undefined as string | undefined,
    domain: "example.com",
    isOwner: true,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Setup
// ═══════════════════════════════════════════════════════════════════════════

let mockGenerateAction: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerateAction = vi.fn().mockResolvedValue({ success: true });
  mockUseAction.mockReturnValue(mockGenerateAction);
  mockUseQuery.mockReturnValue(null);
});

// ═══════════════════════════════════════════════════════════════════════════
// Visibility rules
// ═══════════════════════════════════════════════════════════════════════════

describe("AgentPlanButton", () => {
  describe("visibility rules", () => {
    it("does not render when platform is a CMS (wordpress)", () => {
      const { container } = render(
        <AgentPlanButton {...makeAuditProps({ platform: "wordpress" })} />,
      );
      expect(container.innerHTML).toBe("");
    });

    it("does not render when platform is a CMS (squarespace)", () => {
      const { container } = render(
        <AgentPlanButton {...makeAuditProps({ platform: "squarespace" })} />,
      );
      expect(container.innerHTML).toBe("");
    });

    it("does not render when platform is null/undefined", () => {
      const { container } = render(
        <AgentPlanButton {...makeAuditProps({ platform: undefined })} />,
      );
      expect(container.innerHTML).toBe("");
    });

    it("does not render when total violations is 0", () => {
      const { container } = render(
        <AgentPlanButton
          {...makeAuditProps({ totalViolations: 0, mobileTotalViolations: 0 })}
        />,
      );
      expect(container.innerHTML).toBe("");
    });

    it("does not render when audit status is not complete", () => {
      const { container } = render(
        <AgentPlanButton {...makeAuditProps({ status: "scanning" })} />,
      );
      expect(container.innerHTML).toBe("");
    });

    it("does not render when isOwner is false", () => {
      const { container } = render(
        <AgentPlanButton {...makeAuditProps({ isOwner: false })} />,
      );
      expect(container.innerHTML).toBe("");
    });

    it("renders when platform is a dev framework and has violations", () => {
      render(<AgentPlanButton {...makeAuditProps()} />);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Button states
  // ═══════════════════════════════════════════════════════════════════════════

  describe("button states", () => {
    it("renders 'Generate AI Fix Plan' when agentPlanFileId is null/undefined", () => {
      render(
        <AgentPlanButton
          {...makeAuditProps({ agentPlanFileId: undefined })}
        />,
      );
      expect(screen.getByText("Generate AI Fix Plan")).toBeInTheDocument();
    });

    it("renders 'View AI Fix Plan' and 'Download ZIP' when agentPlanFileId is present", () => {
      render(
        <AgentPlanButton
          {...makeAuditProps({ agentPlanFileId: "storage-abc" })}
        />,
      );
      expect(screen.getByText("View AI Fix Plan")).toBeInTheDocument();
      expect(screen.getByText("Download ZIP")).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Generation flow
  // ═══════════════════════════════════════════════════════════════════════════

  describe("generation flow", () => {
    it("shows loading state during generation", async () => {
      mockGenerateAction.mockReturnValue(
        new Promise(() => {}), // never resolves — simulates in-flight
      );

      render(<AgentPlanButton {...makeAuditProps()} />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText("Generating...")).toBeInTheDocument();
      });
    });

    it("calls the correct Convex action with the audit ID on click", async () => {
      render(<AgentPlanButton {...makeAuditProps()} />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockGenerateAction).toHaveBeenCalledWith({
          auditId: AUDIT_ID,
        });
      });
    });

    it("shows error message when generation fails", async () => {
      mockGenerateAction.mockResolvedValue({
        success: false,
        error: "Something went wrong",
      });

      render(<AgentPlanButton {...makeAuditProps()} />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
      });
    });
  });
});
