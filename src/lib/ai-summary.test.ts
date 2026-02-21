import { describe, it, expect, vi, afterEach } from "vitest";

// Shared mock for the create function — survives resets because
// we only reset its call history, not its implementation.
const mockCreate = vi.fn();

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
  };
});

import { generateAISummary } from "./ai-summary";

afterEach(() => {
  mockCreate.mockReset();
  vi.unstubAllEnvs();
});

describe("generateAISummary", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // API KEY VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("API key validation", () => {
    it("throws when OPENAI_API_KEY is not set", async () => {
      delete process.env.OPENAI_API_KEY;

      await expect(generateAISummary("[]")).rejects.toThrow(
        "OPENAI_API_KEY environment variable is not set",
      );
    });

    it("throws with helpful message mentioning --no-ai", async () => {
      delete process.env.OPENAI_API_KEY;

      await expect(generateAISummary("[]")).rejects.toThrow("--no-ai");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ZERO VIOLATIONS (SHORT-CIRCUIT)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("zero violations", () => {
    it("returns positive summary without calling OpenAI", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test-key");

      const result = await generateAISummary("[]");

      expect(result.summary).toContain("passed all automated");
      expect(result.topIssues).toEqual([]);
      // OpenAI should NOT have been called
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUCCESSFUL AI RESPONSE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("successful AI response", () => {
    const sampleViolations = JSON.stringify([
      {
        id: "image-alt",
        impact: "critical",
        help: "Images must have alternate text",
        nodes: [{ html: "<img src='logo.png'>" }],
      },
    ]);

    it("returns summary and top issues from OpenAI", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test-key");

      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "The site has critical image accessibility issues.",
                topIssues: [
                  "Missing alt text on images",
                  "No skip navigation",
                  "Low contrast text",
                ],
              }),
            },
          },
        ],
      });

      const result = await generateAISummary(sampleViolations);

      expect(result.summary).toBe(
        "The site has critical image accessibility issues.",
      );
      expect(result.topIssues).toEqual([
        "Missing alt text on images",
        "No skip navigation",
        "Low contrast text",
      ]);
    });

    it("calls OpenAI with gpt-4.1-mini model by default", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test-key");

      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({ summary: "test", topIssues: [] }),
            },
          },
        ],
      });

      const result = await generateAISummary(sampleViolations);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-4.1-mini",
          response_format: { type: "json_object" },
        }),
      );
      expect(result.model).toBe("gpt-4.1-mini");
    });

    it("uses a custom model when provided", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test-key");

      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({ summary: "test", topIssues: [] }),
            },
          },
        ],
      });

      const result = await generateAISummary(sampleViolations, "gpt-4o");

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-4o" }),
      );
      expect(result.model).toBe("gpt-4o");
    });

    it("sends system and user prompts", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test-key");

      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({ summary: "test", topIssues: [] }),
            },
          },
        ],
      });

      await generateAISummary(sampleViolations);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(2);
      expect(callArgs.messages[0].role).toBe("system");
      expect(callArgs.messages[1].role).toBe("user");
      expect(callArgs.messages[0].content).toContain("accessibility expert");
    });

    it("handles a single top issue (dynamic count)", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test-key");

      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "One minor issue found.",
                topIssues: ["Add alt text to the hero image"],
              }),
            },
          },
        ],
      });

      const result = await generateAISummary(sampleViolations);

      expect(result.topIssues).toHaveLength(1);
      expect(result.topIssues[0]).toBe("Add alt text to the hero image");
    });

    it("caps topIssues at 5 even if AI returns more", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test-key");

      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "Many issues found.",
                topIssues: [
                  "Issue 1",
                  "Issue 2",
                  "Issue 3",
                  "Issue 4",
                  "Issue 5",
                  "Issue 6 — should be dropped",
                  "Issue 7 — should be dropped",
                ],
              }),
            },
          },
        ],
      });

      const result = await generateAISummary(sampleViolations);

      expect(result.topIssues).toHaveLength(5);
      expect(result.topIssues[4]).toBe("Issue 5");
    });

    it("limits violations sent to OpenAI to 10", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test-key");

      // Create 15 violations
      const manyViolations = JSON.stringify(
        Array.from({ length: 15 }, (_, i) => ({
          id: `rule-${i}`,
          impact: "moderate",
          help: `Rule ${i}`,
          nodes: [],
        })),
      );

      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({ summary: "test", topIssues: [] }),
            },
          },
        ],
      });

      await generateAISummary(manyViolations);

      const callArgs = mockCreate.mock.calls[0][0];
      const userMessage = callArgs.messages[1].content as string;
      // The prompt should only include the first 10 violations
      expect(userMessage).toContain("rule-0");
      expect(userMessage).toContain("rule-9");
      expect(userMessage).not.toContain("rule-10");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  describe("error handling", () => {
    it("throws when OpenAI returns no content", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test-key");

      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const violations = JSON.stringify([
        { id: "test", impact: "minor", help: "test", nodes: [] },
      ]);

      await expect(generateAISummary(violations)).rejects.toThrow(
        "No response from OpenAI",
      );
    });

    it("falls back to default summary when response lacks summary field", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test-key");

      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({}),
            },
          },
        ],
      });

      const violations = JSON.stringify([
        { id: "test", impact: "minor", help: "test", nodes: [] },
      ]);

      const result = await generateAISummary(violations);

      expect(result.summary).toBe("Analysis complete.");
      expect(result.topIssues).toEqual([]);
    });
  });
});
