// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EngineSummaryAccordion } from "./EngineSummaryAccordion";

describe("EngineSummaryAccordion", () => {
  it("combines scan coverage and engine details for comprehensive full scans", () => {
    render(
      <EngineSummaryAccordion
        engineProfile="comprehensive"
        engineSummary={{
          selectedEngines: ["axe", "htmlcs", "ace"],
          engines: [
            {
              engine: "axe",
              status: "completed",
              durationMs: 143,
              confirmedCount: 12,
              reviewCount: 0,
            },
            {
              engine: "htmlcs",
              status: "completed",
              durationMs: 211,
              confirmedCount: 4,
              reviewCount: 3,
            },
            {
              engine: "ace",
              status: "completed",
              durationMs: 169,
              confirmedCount: 2,
              reviewCount: 1,
            },
          ],
        }}
        scanMode="full"
        scanModeDetail={JSON.stringify({
          mode: "full",
          rulesRun: 39,
          skippedCategories: [],
        })}
        viewport="desktop"
        headingLevel="h2"
      />,
    );

    expect(screen.getByText("Scan Coverage & Engines")).toBeInTheDocument();
    expect(screen.getByText("Comprehensive profile")).toBeInTheDocument();
    expect(screen.getByText("Full axe-core coverage")).toBeInTheDocument();
    expect(
      screen.getByText(/axe-core completed 39 checks at the desktop viewport\./i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /scan coverage & engines/i }));

    expect(screen.getByText("Engine Breakdown")).toBeInTheDocument();
    expect(screen.getByText("HTML_CodeSniffer")).toBeInTheDocument();
    expect(screen.getByText("IBM ACE")).toBeInTheDocument();
  });

  it("shows skipped axe-core categories for partial scans", () => {
    render(
      <EngineSummaryAccordion
        engineProfile="strict"
        engineSummary={{
          selectedEngines: ["axe"],
          engines: [
            {
              engine: "axe",
              status: "completed",
              durationMs: 88,
              confirmedCount: 7,
              reviewCount: 0,
            },
          ],
        }}
        scanMode="safe"
        scanModeDetail={JSON.stringify({
          mode: "safe-rules",
          rulesRun: 24,
          skippedCategories: [
            {
              name: "Color contrast",
              reason: "Computed styles were too expensive on this page",
              ruleIds: ["color-contrast"],
            },
          ],
        })}
        viewport="mobile"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /scan coverage & engines/i }));

    expect(
      screen.getAllByText(/axe-core completed 24 of 25 checks at the mobile viewport\./i),
    ).toHaveLength(2);
    expect(screen.getByText("Skipped axe-core categories")).toBeInTheDocument();
    expect(screen.getByText(/Color contrast/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Computed styles were too expensive on this page/i),
    ).toBeInTheDocument();
  });

  it("keeps structural scan limitations visible even without engine summaries", () => {
    render(
      <EngineSummaryAccordion
        scanMode="jsdom-structural"
        scanModeDetail={JSON.stringify({
          mode: "jsdom-structural",
          rulesRun: 12,
          skippedCategories: [
            {
              name: "Browser-only checks",
              reason: "This scan ran without a live browser context",
              ruleIds: ["color-contrast", "aria-hidden-focus"],
            },
          ],
        })}
        viewport="desktop"
        totalViolations={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /scan coverage & engines/i }));

    expect(
      screen.getAllByText(/firewall required server-side analysis/i),
    ).toHaveLength(2);
    expect(
      screen.getByText(/Limited results: this page likely needs a live browser/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Engine execution details are not available for this audit\./i),
    ).toBeInTheDocument();
  });
});
