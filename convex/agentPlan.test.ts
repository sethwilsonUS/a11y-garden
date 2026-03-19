import { describe, it, expect, vi } from "vitest";
import type { Mock } from "vitest";
import { generateAgentPlanCore, CMS_PLATFORMS } from "./agentPlan";
import type { AgentPlanDeps } from "./agentPlan";

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const FAKE_STORAGE_ID = "storage-id-abc123" as unknown as string;
const FAKE_AGENTS_MD = "# AGENTS.md\n\n## Critical Fixes\n...";

function makeAudit(overrides: Record<string, unknown> = {}) {
  return {
    _id: "audit-123",
    url: "https://example.com",
    domain: "example.com",
    pageTitle: "Example Site",
    platform: "nextjs",
    scannedAt: Date.now(),
    rawViolations: JSON.stringify([
      {
        id: "color-contrast",
        impact: "serious",
        description: "Elements must have sufficient color contrast",
        helpUrl: "https://dequeuniversity.com/rules/color-contrast",
        tags: ["wcag2aa", "wcag143"],
        nodes: [{ target: [".text"], html: "<p class='text'>low contrast</p>" }],
      },
    ]),
    mobileRawViolations: JSON.stringify([
      {
        id: "image-alt",
        impact: "critical",
        description: "Images must have alternate text",
        helpUrl: "https://dequeuniversity.com/rules/image-alt",
        tags: ["wcag2a", "wcag111"],
        nodes: [{ target: ["img.hero"], html: "<img class='hero'>" }],
      },
    ]),
    violations: { critical: 0, serious: 1, moderate: 0, minor: 0, total: 1 },
    ...overrides,
  };
}

type MockDeps = {
  [K in keyof AgentPlanDeps]: AgentPlanDeps[K] & Mock;
};

function makeDeps(overrides: Partial<AgentPlanDeps> = {}): MockDeps {
  return {
    runQuery: vi.fn().mockResolvedValue(makeAudit()),
    runMutation: vi.fn().mockResolvedValue(undefined),
    storageStore: vi.fn().mockResolvedValue(FAKE_STORAGE_ID),
    openaiCreate: vi.fn().mockResolvedValue({
      choices: [{ message: { content: FAKE_AGENTS_MD } }],
    }),
    ...overrides,
  } as MockDeps;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("generateAgentPlanCore", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Happy path
  // ─────────────────────────────────────────────────────────────────────────

  describe("successful generation", () => {
    it("calls OpenAI with the correct model name (gpt-5.4-mini)", async () => {
      const deps = makeDeps();
      await generateAgentPlanCore(deps, { auditId: "audit-123" });

      expect(deps.openaiCreate).toHaveBeenCalledOnce();
      const callArgs = deps.openaiCreate.mock.calls[0][0];
      expect(callArgs.model).toBe("gpt-5.4-mini");
    });

    it("passes system and user prompts from buildAgentPlanPrompt correctly", async () => {
      const deps = makeDeps();
      await generateAgentPlanCore(deps, { auditId: "audit-123" });

      const callArgs = deps.openaiCreate.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(2);
      expect(callArgs.messages[0].role).toBe("system");
      expect(callArgs.messages[1].role).toBe("user");
      expect(callArgs.messages[0].content.length).toBeGreaterThan(0);
      expect(callArgs.messages[1].content.length).toBeGreaterThan(0);
    });

    it("sets temperature to 0.3 and max_completion_tokens to 6144", async () => {
      const deps = makeDeps();
      await generateAgentPlanCore(deps, { auditId: "audit-123" });

      const callArgs = deps.openaiCreate.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.3);
      expect(callArgs.max_completion_tokens).toBe(6144);
    });

    it("stores the generated markdown in Convex file storage", async () => {
      const deps = makeDeps();
      await generateAgentPlanCore(deps, { auditId: "audit-123" });

      expect(deps.storageStore).toHaveBeenCalledOnce();
      const storedBlob = deps.storageStore.mock.calls[0][0];
      expect(storedBlob).toBeInstanceOf(Blob);

      const text = await storedBlob.text();
      expect(text).toBe(FAKE_AGENTS_MD);
    });

    it("writes the storageId back to the audit via updateAuditAgentPlan", async () => {
      const deps = makeDeps();
      await generateAgentPlanCore(deps, { auditId: "audit-123" });

      expect(deps.runMutation).toHaveBeenCalledOnce();
      const mutationArgs = deps.runMutation.mock.calls[0];
      const payload = mutationArgs[1] as Record<string, unknown>;
      expect(payload).toMatchObject({
        auditId: "audit-123",
        agentPlanFileId: FAKE_STORAGE_ID,
      });
      expect(payload.agentPlanGeneratedAt).toBeTypeOf("number");
    });

    it("returns { success: true } on successful generation", async () => {
      const deps = makeDeps();
      const result = await generateAgentPlanCore(deps, { auditId: "audit-123" });

      expect(result).toEqual({ success: true });
    });

    it("merges desktop + mobile violations before grouping", async () => {
      const deps = makeDeps();
      await generateAgentPlanCore(deps, { auditId: "audit-123" });

      const callArgs = deps.openaiCreate.mock.calls[0][0];
      const userPrompt: string = callArgs.messages[1].content;
      // Both the desktop "color-contrast" and mobile "image-alt" should appear
      expect(userPrompt).toContain("color-contrast");
      expect(userPrompt).toContain("image-alt");
    });

    it("passes scan coverage context and confirmed-only counts into the prompt", async () => {
      const deps = makeDeps({
        runQuery: vi.fn().mockResolvedValue(
          makeAudit({
            engineProfile: "comprehensive",
            engineSummary: JSON.stringify({
              selectedEngines: ["axe", "htmlcs", "ace"],
              engines: [
                { engine: "axe", status: "completed", durationMs: 1, confirmedCount: 1, reviewCount: 0 },
                { engine: "htmlcs", status: "failed", durationMs: 1, confirmedCount: 0, reviewCount: 0, note: "Timed out" },
                { engine: "ace", status: "completed", durationMs: 1, confirmedCount: 1, reviewCount: 0 },
              ],
            }),
            truncated: true,
          }),
        ),
      });

      await generateAgentPlanCore(deps, { auditId: "audit-123" });

      const callArgs = deps.openaiCreate.mock.calls[0][0];
      const userPrompt: string = callArgs.messages[1].content;
      expect(userPrompt).toContain("Scan profile: Comprehensive");
      expect(userPrompt).toContain("Confirmed findings available: 2 confirmed findings");
      expect(userPrompt).toContain("Desktop engine coverage was partial");
      expect(userPrompt).toContain("representative rather than exhaustive");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CMS platform rejection
  // ─────────────────────────────────────────────────────────────────────────

  describe("CMS platform rejection", () => {
    it("returns { success: false, error } when platform is a CMS (wordpress)", async () => {
      const deps = makeDeps({
        runQuery: vi.fn().mockResolvedValue(makeAudit({ platform: "wordpress" })),
      });

      const result = await generateAgentPlanCore(deps, { auditId: "audit-123" });

      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
      expect(deps.openaiCreate).not.toHaveBeenCalled();
    });

    it("returns { success: false, error } when platform is squarespace", async () => {
      const deps = makeDeps({
        runQuery: vi.fn().mockResolvedValue(makeAudit({ platform: "squarespace" })),
      });

      const result = await generateAgentPlanCore(deps, { auditId: "audit-123" });

      expect(result.success).toBe(false);
      expect(deps.openaiCreate).not.toHaveBeenCalled();
    });

    it("returns { success: false, error } when platform is null/undefined", async () => {
      const deps = makeDeps({
        runQuery: vi.fn().mockResolvedValue(makeAudit({ platform: undefined })),
      });

      const result = await generateAgentPlanCore(deps, { auditId: "audit-123" });

      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
      expect(deps.openaiCreate).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Missing / empty violations
  // ─────────────────────────────────────────────────────────────────────────

  describe("missing or empty violations", () => {
    it("returns { success: false, error } when no findings are available", async () => {
      const deps = makeDeps({
        runQuery: vi.fn().mockResolvedValue(
          makeAudit({
            rawViolations: undefined,
            mobileRawViolations: undefined,
          }),
        ),
      });

      const result = await generateAgentPlanCore(deps, { auditId: "audit-123" });

      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
      expect(deps.openaiCreate).not.toHaveBeenCalled();
    });

    it("returns { success: false, error } when rawViolations is empty array", async () => {
      const deps = makeDeps({
        runQuery: vi.fn().mockResolvedValue(
          makeAudit({ rawViolations: "[]", mobileRawViolations: undefined }),
        ),
      });

      const result = await generateAgentPlanCore(deps, { auditId: "audit-123" });

      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
      expect(deps.openaiCreate).not.toHaveBeenCalled();
    });

    it("returns { success: false, error } when only needs-review findings are available", async () => {
      const deps = makeDeps({
        runQuery: vi.fn().mockResolvedValue(
          makeAudit({
            rawViolations: undefined,
            rawFindings: JSON.stringify([
              {
                id: "manual-check",
                dedupKey: "needs-review:.hero:2.4.6",
                engines: ["htmlcs"],
                engineRuleIds: { htmlcs: ["manual-check"] },
                disposition: "needs-review",
                impact: "moderate",
                help: "Check heading structure",
                description: "Needs manual review",
                wcagCriteria: ["2.4.6"],
                wcagTags: [],
                nodes: [{ selector: ".hero" }],
              },
            ]),
            mobileRawViolations: undefined,
            mobileRawFindings: undefined,
          }),
        ),
      });

      const result = await generateAgentPlanCore(deps, { auditId: "audit-123" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Only manual-review findings");
      }
      expect(deps.openaiCreate).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // OpenAI failure
  // ─────────────────────────────────────────────────────────────────────────

  describe("OpenAI failure handling", () => {
    it("returns { success: false, error } on OpenAI API failure", async () => {
      const deps = makeDeps({
        openaiCreate: vi.fn().mockRejectedValue(new Error("API rate limit exceeded")),
      });

      const result = await generateAgentPlanCore(deps, { auditId: "audit-123" });

      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
      if (!result.success) {
        expect(result.error).toContain("API rate limit exceeded");
      }
    });

    it("returns { success: false, error } when OpenAI returns empty content", async () => {
      const deps = makeDeps({
        openaiCreate: vi.fn().mockResolvedValue({
          choices: [{ message: { content: null } }],
        }),
      });

      const result = await generateAgentPlanCore(deps, { auditId: "audit-123" });

      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Audit not found
  // ─────────────────────────────────────────────────────────────────────────

  describe("audit not found", () => {
    it("returns { success: false, error } when audit does not exist", async () => {
      const deps = makeDeps({
        runQuery: vi.fn().mockResolvedValue(null),
      });

      const result = await generateAgentPlanCore(deps, { auditId: "audit-123" });

      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CMS_PLATFORMS set
  // ─────────────────────────────────────────────────────────────────────────

  describe("CMS_PLATFORMS constant", () => {
    it("includes all expected CMS platforms", () => {
      const expected = [
        "wordpress", "squarespace", "shopify", "wix", "webflow",
        "drupal", "joomla", "ghost", "hubspot", "weebly",
      ];
      for (const slug of expected) {
        expect(CMS_PLATFORMS.has(slug)).toBe(true);
      }
    });

    it("does not include developer frameworks", () => {
      const devFrameworks = ["nextjs", "nuxt", "gatsby", "angular", "remix", "astro", "react", "vue", "svelte"];
      for (const slug of devFrameworks) {
        expect(CMS_PLATFORMS.has(slug)).toBe(false);
      }
    });
  });
});
