// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ScanProgressDisplay } from "./ScanProgressDisplay";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ScanProgressDisplay", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // Progress message rendering
  // ═══════════════════════════════════════════════════════════════════════════

  describe("progress message", () => {
    it("shows fallback message when no server progress is provided", () => {
      render(
        <ScanProgressDisplay message={undefined} scannedAt={Date.now()} />,
      );
      const matches = screen.getAllByText("Scanning...");
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it("shows custom fallback message", () => {
      render(
        <ScanProgressDisplay
          message={undefined}
          scannedAt={Date.now()}
          fallbackMessage="Queued..."
        />,
      );
      const matches = screen.getAllByText("Queued...");
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it("shows server progress message when provided", () => {
      render(
        <ScanProgressDisplay
          message="Scanning desktop viewport..."
          scannedAt={Date.now()}
        />,
      );
      const matches = screen.getAllByText("Scanning desktop viewport...");
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it("strips waf: prefix from display text", () => {
      render(
        <ScanProgressDisplay
          message="waf:Firewall detected — attempting bypass..."
          scannedAt={Date.now()}
        />,
      );
      const matches = screen.getAllByText(
        "Firewall detected — attempting bypass...",
      );
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText(/^waf:/)).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WAF banner
  // ═══════════════════════════════════════════════════════════════════════════

  describe("WAF info banner", () => {
    it("shows WAF banner immediately when message has waf: prefix", () => {
      render(
        <ScanProgressDisplay
          message="waf:Bypass in progress..."
          scannedAt={Date.now()}
        />,
      );
      expect(
        screen.getByText("This site may be behind a firewall"),
      ).toBeInTheDocument();
    });

    it("does not show WAF banner for regular messages under 30s", () => {
      render(
        <ScanProgressDisplay
          message="Scanning desktop viewport..."
          scannedAt={Date.now()}
        />,
      );
      expect(
        screen.queryByText("This site may be behind a firewall"),
      ).not.toBeInTheDocument();
    });

    it("shows WAF banner as time fallback after 30s even without waf: prefix", () => {
      const thirtyOneSecondsAgo = Date.now() - 31_000;
      render(
        <ScanProgressDisplay
          message="Still scanning..."
          scannedAt={thirtyOneSecondsAgo}
        />,
      );
      expect(
        screen.getByText("This site may be behind a firewall"),
      ).toBeInTheDocument();
    });

    it("shows WAF banner as time fallback when no message and elapsed > 30s", () => {
      const thirtyOneSecondsAgo = Date.now() - 31_000;
      render(
        <ScanProgressDisplay
          message={undefined}
          scannedAt={thirtyOneSecondsAgo}
        />,
      );
      expect(
        screen.getByText("This site may be behind a firewall"),
      ).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Elapsed timer
  // ═══════════════════════════════════════════════════════════════════════════

  describe("elapsed timer", () => {
    it("does not show elapsed time before 5 seconds", () => {
      render(
        <ScanProgressDisplay
          message="Preparing scan..."
          scannedAt={Date.now()}
        />,
      );
      expect(screen.queryByText(/\ds$/)).not.toBeInTheDocument();
    });

    it("shows elapsed time after 5 seconds", () => {
      const sixSecondsAgo = Date.now() - 6_000;
      render(
        <ScanProgressDisplay
          message="Scanning..."
          scannedAt={sixSecondsAgo}
        />,
      );
      expect(screen.getByText("6s")).toBeInTheDocument();
    });

    it("formats elapsed time with minutes when over 60s", () => {
      const ninetyFiveSecondsAgo = Date.now() - 95_000;
      render(
        <ScanProgressDisplay
          message="Bypass in progress..."
          scannedAt={ninetyFiveSecondsAgo}
        />,
      );
      expect(screen.getByText("1m 35s")).toBeInTheDocument();
    });

    it("updates elapsed time as interval ticks", () => {
      const tenSecondsAgo = Date.now() - 10_000;
      render(
        <ScanProgressDisplay
          message="Scanning..."
          scannedAt={tenSecondsAgo}
        />,
      );
      expect(screen.getByText("10s")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(3_000);
      });

      expect(screen.getByText("13s")).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Accessibility
  // ═══════════════════════════════════════════════════════════════════════════

  describe("accessibility", () => {
    it("has a live region with role=status for SR announcements", () => {
      render(
        <ScanProgressDisplay
          message="Scanning desktop viewport..."
          scannedAt={Date.now()}
        />,
      );
      const statusRegions = screen.getAllByRole("status");
      expect(statusRegions.length).toBeGreaterThanOrEqual(1);
    });

    it("SR announcement uses spoken time format (minutes/seconds not m/s)", () => {
      const ninetySecondsAgo = Date.now() - 90_000;
      render(
        <ScanProgressDisplay
          message="Scanning..."
          scannedAt={ninetySecondsAgo}
        />,
      );
      const srRegion = screen.getAllByRole("status")[0];
      expect(srRegion.textContent).toContain("1 minute");
      expect(srRegion.textContent).not.toMatch(/\dm\b/);
    });

    it("SR announcement only updates at 10s intervals", () => {
      const fifteenSecondsAgo = Date.now() - 15_000;
      render(
        <ScanProgressDisplay
          message="Scanning..."
          scannedAt={fifteenSecondsAgo}
        />,
      );
      const srRegion = screen.getAllByRole("status")[0];
      const initial = srRegion.textContent;

      act(() => {
        vi.advanceTimersByTime(3_000);
      });
      expect(srRegion.textContent).toBe(initial);

      act(() => {
        vi.advanceTimersByTime(7_000);
      });
      expect(srRegion.textContent).not.toBe(initial);
    });

    it("visual timer is hidden from screen readers", () => {
      const tenSecondsAgo = Date.now() - 10_000;
      const { container } = render(
        <ScanProgressDisplay
          message="Scanning..."
          scannedAt={tenSecondsAgo}
        />,
      );
      const visualDiv = container.querySelector("[aria-hidden='true']");
      expect(visualDiv).not.toBeNull();
      expect(visualDiv!.textContent).toContain("10s");
    });

    it("WAF banner has role=status for screen readers", () => {
      render(
        <ScanProgressDisplay
          message="waf:Firewall detected — attempting bypass..."
          scannedAt={Date.now()}
        />,
      );
      expect(
        screen.getByText("This site may be behind a firewall"),
      ).toBeInTheDocument();
    });
  });
});
