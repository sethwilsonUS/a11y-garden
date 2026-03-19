import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import type { DOMWindow } from "jsdom";
import { runAceOnDom } from "./ace-runner";

describe("runAceOnDom", () => {
  it("uses ACE policy metadata to soften advisory needs-review findings", async () => {
    const dom = new JSDOM(`
      <main>
        <button>Buy now</button>
      </main>
    `);

    (
      dom.window as unknown as Record<string, unknown>
    ).ace = {
      Checker: class {
        async check() {
          return {
            results: [
              {
                ruleId: "label-required",
                value: ["VIOLATION", "POTENTIAL"],
                message: "Potential label issue",
                snippet: "<button>Buy now</button>",
                path: { dom: "/html/body/main/button[1]" },
              },
              {
                ruleId: "label-advisory",
                value: ["RECOMMENDATION", "POTENTIAL"],
                message: "Recommended label improvement",
                snippet: "<button>Buy now</button>",
                path: { dom: "/html/body/main/button[1]" },
              },
              {
                ruleId: "structure-advisory",
                value: ["RECOMMENDATION", "MANUAL"],
                message: "Manual structural review",
                snippet: "<main></main>",
                path: { dom: "/html/body/main" },
              },
            ],
          };
        }
      },
    };

    const findings = await runAceOnDom(dom.window as unknown as DOMWindow);

    expect(findings).toHaveLength(3);
    expect(findings.find((finding) => finding.id === "label-required")?.impact).toBe("serious");
    expect(findings.find((finding) => finding.id === "label-advisory")?.impact).toBe("moderate");
    expect(findings.find((finding) => finding.id === "structure-advisory")?.impact).toBe("minor");

    dom.window.close();
  });
});
