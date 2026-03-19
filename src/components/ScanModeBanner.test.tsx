// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ScanModeBanner } from "./ScanModeBanner";

describe("ScanModeBanner", () => {
  it("describes full scans as axe-core checks instead of all accessibility rules", () => {
    render(
      <ScanModeBanner
        scanMode="full"
        scanModeDetail={JSON.stringify({
          mode: "full",
          rulesRun: 37,
          skippedCategories: [],
        })}
        viewport="desktop"
        engineProfile="strict"
      />,
    );

    expect(screen.getByText("Full axe-core scan")).toBeInTheDocument();
    expect(
      screen.getByText(/axe-core completed 37 checks at the desktop viewport\./i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/All 37 accessibility rules checked/i)).not.toBeInTheDocument();
  });

  it("adds a multi-engine hint for comprehensive scans", () => {
    render(
      <ScanModeBanner
        scanMode="full"
        scanModeDetail={JSON.stringify({
          mode: "full",
          rulesRun: 37,
          skippedCategories: [],
        })}
        viewport="desktop"
        engineProfile="comprehensive"
      />,
    );

    expect(
      screen.getByText(/See Scan Engines below for the full multi-engine breakdown\./i),
    ).toBeInTheDocument();
  });
});
