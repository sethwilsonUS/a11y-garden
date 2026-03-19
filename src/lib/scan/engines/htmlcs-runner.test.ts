import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import type { DOMWindow } from "jsdom";
import { runHtmlcsOnDom } from "./htmlcs-runner";

describe("runHtmlcsOnDom", () => {
  it("falls back to the document selector for non-element HTMLCS targets", async () => {
    const dom = new JSDOM(`
      <main>
        <img src="/logo.png">
        <h3>Skipped heading level</h3>
      </main>
    `);

    const textNode = dom.window.document.createTextNode("not-an-element");
    const img = dom.window.document.querySelector("img");

    (
      dom.window as unknown as Record<string, unknown>
    ).HTMLCS = {
      process(
        _standard: string,
        _doc: Document,
        callback: () => void,
      ) {
        callback();
      },
      getMessages() {
        return [
          {
            type: 1,
            code: "WCAG2AA.Principle1.Guideline1_1.1_1_1.H30.2",
            msg: "Images must have alternate text",
            element: textNode as unknown as Element,
          },
          {
            type: 2,
            code: "WCAG2AA.Principle1.Guideline1_3.1_3_1.H42",
            msg: "Headings should not skip levels",
            element: img,
          },
          {
            type: 2,
            code: "WCAG2AA.Principle2.Guideline2_4.2_4_2.H25.1.NoTitleEl",
            msg: "Pages should have a title",
            element: img,
          },
        ];
      },
    };

    const findings = await runHtmlcsOnDom(dom.window as unknown as DOMWindow);

    expect(findings).toHaveLength(3);
    expect(findings[0].nodes[0].selector).toBe("document");
    expect(findings[1].nodes[0].selector).toContain("img");
    expect(findings[1].impact).toBe("serious");
    expect(findings[2].impact).toBe("minor");

    dom.window.close();
  });
});
