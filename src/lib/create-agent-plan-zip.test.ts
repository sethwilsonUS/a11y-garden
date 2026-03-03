import { describe, it, expect } from "vitest";
import { unzipSync } from "fflate";
import {
  createAgentPlanZipBlob,
  sanitizeDomain,
} from "./create-agent-plan-zip";

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function unpackZip(
  blob: Blob,
): Promise<Record<string, string>> {
  const buffer = await blob.arrayBuffer();
  const files = unzipSync(new Uint8Array(buffer));
  const result: Record<string, string> = {};
  for (const [name, data] of Object.entries(files)) {
    result[name] = new TextDecoder().decode(data);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("createAgentPlanZipBlob", () => {
  const SAMPLE_MD = "# AGENTS.md\n\n## Critical Fixes\n\nFix all the things.";

  // ─────────────────────────────────────────────────────────────────────────
  // Blob output
  // ─────────────────────────────────────────────────────────────────────────

  it("generates a Blob with non-zero byte length", async () => {
    const blob = createAgentPlanZipBlob({
      agentPlanMd: SAMPLE_MD,
      siteDomain: "example.com",
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // File contents
  // ─────────────────────────────────────────────────────────────────────────

  it("ZIP contains exactly 3 files: AGENTS.md, CLAUDE.md, README-agent-plan.md", async () => {
    const blob = createAgentPlanZipBlob({
      agentPlanMd: SAMPLE_MD,
      siteDomain: "example.com",
    });

    const files = await unpackZip(blob);
    const names = Object.keys(files).sort();

    expect(names).toEqual(
      ["AGENTS.md", "CLAUDE.md", "README-agent-plan.md"].sort(),
    );
  });

  it("AGENTS.md content matches the input agentPlanMd string", async () => {
    const blob = createAgentPlanZipBlob({
      agentPlanMd: SAMPLE_MD,
      siteDomain: "example.com",
    });

    const files = await unpackZip(blob);

    expect(files["AGENTS.md"]).toBe(SAMPLE_MD);
  });

  it("CLAUDE.md contains a reference to AGENTS.md", async () => {
    const blob = createAgentPlanZipBlob({
      agentPlanMd: SAMPLE_MD,
      siteDomain: "example.com",
    });

    const files = await unpackZip(blob);

    expect(files["CLAUDE.md"]).toContain("AGENTS.md");
  });

  it("README-agent-plan.md mentions Cursor, Codex, and Claude Code", async () => {
    const blob = createAgentPlanZipBlob({
      agentPlanMd: SAMPLE_MD,
      siteDomain: "example.com",
    });

    const files = await unpackZip(blob);
    const readme = files["README-agent-plan.md"];

    expect(readme).toContain("Cursor");
    expect(readme).toContain("Codex");
    expect(readme).toContain("Claude Code");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Domain sanitization
  // ─────────────────────────────────────────────────────────────────────────

  describe("sanitizeDomain", () => {
    it("replaces dots with hyphens (example.com → example-com)", () => {
      expect(sanitizeDomain("example.com")).toBe("example-com");
    });

    it("replaces special chars with hyphens", () => {
      expect(sanitizeDomain("my-site.co.uk")).toBe("my-site-co-uk");
    });

    it("handles subdomains", () => {
      expect(sanitizeDomain("app.staging.example.com")).toBe(
        "app-staging-example-com",
      );
    });

    it("strips leading/trailing hyphens", () => {
      expect(sanitizeDomain(".example.com.")).toBe("example-com");
    });

    it("collapses consecutive hyphens", () => {
      expect(sanitizeDomain("my..site...com")).toBe("my-site-com");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Edge cases
  // ─────────────────────────────────────────────────────────────────────────

  it("handles empty agentPlanMd without throwing", async () => {
    const blob = createAgentPlanZipBlob({
      agentPlanMd: "",
      siteDomain: "example.com",
    });

    expect(blob.size).toBeGreaterThan(0);

    const files = await unpackZip(blob);
    expect(files["AGENTS.md"]).toBe("");
  });
});
