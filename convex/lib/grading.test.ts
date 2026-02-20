import { describe, it, expect } from "vitest";
import {
  calculateGrade,
  GRADING_VERSION,
  type ViolationCounts,
} from "./grading";

describe("calculateGrade", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // PERFECT SCORES
  // ═══════════════════════════════════════════════════════════════════════════

  describe("perfect scores (no violations)", () => {
    it("returns A grade with score 100 when no violations", () => {
      const violations: ViolationCounts = {
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0,
      };

      const result = calculateGrade(violations);

      expect(result.score).toBe(100);
      expect(result.grade).toBe("A");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WEIGHTED PENALTY SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════

  describe("weighted penalty calculations", () => {
    it("applies correct weight for minor violations (1 point each)", () => {
      const violations: ViolationCounts = {
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 5,
      };

      const result = calculateGrade(violations);

      // 100 - (5 * 1) = 95
      expect(result.score).toBe(95);
      expect(result.grade).toBe("A");
    });

    it("applies correct weight for moderate violations (5 points each)", () => {
      const violations: ViolationCounts = {
        critical: 0,
        serious: 0,
        moderate: 2,
        minor: 0,
      };

      const result = calculateGrade(violations);

      // 100 - (2 * 5) = 90
      expect(result.score).toBe(90);
      expect(result.grade).toBe("A");
    });

    it("applies correct weight for serious violations (12 points each)", () => {
      const violations: ViolationCounts = {
        critical: 0,
        serious: 1,
        moderate: 0,
        minor: 0,
      };

      const result = calculateGrade(violations);

      // 100 - (1 * 12) = 88, but capped at 79 due to hard cap
      expect(result.score).toBe(79);
      expect(result.grade).toBe("C");
    });

    it("applies correct weight for critical violations (25 points each)", () => {
      const violations: ViolationCounts = {
        critical: 1,
        serious: 0,
        moderate: 0,
        minor: 0,
      };

      const result = calculateGrade(violations);

      // 100 - (1 * 25) = 75, but capped at 55 due to hard cap
      // Note: 55 is below 60, so this results in F grade
      expect(result.score).toBe(55);
      expect(result.grade).toBe("F");
    });

    it("combines weights correctly for mixed violations", () => {
      const violations: ViolationCounts = {
        critical: 0,
        serious: 0,
        moderate: 1,
        minor: 3,
      };

      const result = calculateGrade(violations);

      // 100 - (1 * 5 + 3 * 1) = 100 - 8 = 92
      expect(result.score).toBe(92);
      expect(result.grade).toBe("A");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HARD CAPS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("hard caps for severe violations", () => {
    describe("critical violations → score capped at 55 (results in F)", () => {
      it("caps score at 55 with 1 critical violation", () => {
        const violations: ViolationCounts = {
          critical: 1,
          serious: 0,
          moderate: 0,
          minor: 0,
        };

        const result = calculateGrade(violations);

        // Cap is 55, which is below 60 threshold for D, so grade is F
        expect(result.score).toBeLessThanOrEqual(55);
        expect(result.grade).toBe("F");
      });

      it("caps score at 55 even when penalty would be less severe", () => {
        // Critical = 25 penalty, so raw score would be 75
        // But hard cap brings it down to 55
        const violations: ViolationCounts = {
          critical: 1,
          serious: 0,
          moderate: 0,
          minor: 0,
        };

        const result = calculateGrade(violations);

        expect(result.score).toBe(55);
      });

      it("returns F when critical violations drive penalty below 60", () => {
        const violations: ViolationCounts = {
          critical: 2,
          serious: 0,
          moderate: 0,
          minor: 0,
        };

        const result = calculateGrade(violations);

        // 100 - (2 * 25) = 50, already below cap
        expect(result.score).toBe(50);
        expect(result.grade).toBe("F");
      });

      it("handles many critical violations", () => {
        const violations: ViolationCounts = {
          critical: 5,
          serious: 0,
          moderate: 0,
          minor: 0,
        };

        const result = calculateGrade(violations);

        // 100 - (5 * 25) = -25 → clamped to 0
        expect(result.score).toBe(0);
        expect(result.grade).toBe("F");
      });
    });

    describe("serious violations → max C grade (score ≤79)", () => {
      it("caps score at 79 with 1 serious violation", () => {
        const violations: ViolationCounts = {
          critical: 0,
          serious: 1,
          moderate: 0,
          minor: 0,
        };

        const result = calculateGrade(violations);

        expect(result.score).toBe(79);
        expect(result.grade).toBe("C");
      });

      it("caps score at 79 even with minimal penalty", () => {
        // 1 serious = 12 penalty, raw score = 88
        // Hard cap brings it to 79
        const violations: ViolationCounts = {
          critical: 0,
          serious: 1,
          moderate: 0,
          minor: 0,
        };

        const result = calculateGrade(violations);

        expect(result.score).toBe(79);
      });

      it("uses penalty score when lower than cap", () => {
        const violations: ViolationCounts = {
          critical: 0,
          serious: 3,
          moderate: 0,
          minor: 0,
        };

        const result = calculateGrade(violations);

        // 100 - (3 * 12) = 64, which is already below 72 cap
        expect(result.score).toBe(64);
        expect(result.grade).toBe("D");
      });
    });

    describe("3+ moderate violations → max B grade (score ≤85)", () => {
      it("caps score at 85 with 3 moderate violations", () => {
        const violations: ViolationCounts = {
          critical: 0,
          serious: 0,
          moderate: 3,
          minor: 0,
        };

        const result = calculateGrade(violations);

        // 100 - (3 * 5) = 85, which equals the cap
        expect(result.score).toBe(85);
        expect(result.grade).toBe("B");
      });

      it("does not cap with only 2 moderate violations", () => {
        const violations: ViolationCounts = {
          critical: 0,
          serious: 0,
          moderate: 2,
          minor: 0,
        };

        const result = calculateGrade(violations);

        // 100 - (2 * 5) = 90, no cap applies
        expect(result.score).toBe(90);
        expect(result.grade).toBe("A");
      });

      it("uses penalty score when lower than cap", () => {
        const violations: ViolationCounts = {
          critical: 0,
          serious: 0,
          moderate: 5,
          minor: 0,
        };

        const result = calculateGrade(violations);

        // 100 - (5 * 5) = 75, which is already below 85 cap
        expect(result.score).toBe(75);
        expect(result.grade).toBe("C");
      });
    });

    describe("cap priority (critical > serious > moderate)", () => {
      it("applies critical cap even when serious violations exist", () => {
        const violations: ViolationCounts = {
          critical: 1,
          serious: 2,
          moderate: 0,
          minor: 0,
        };

        const result = calculateGrade(violations);

        // Critical cap (55) takes precedence
        expect(result.score).toBeLessThanOrEqual(55);
      });

      it("applies serious cap when no critical but moderate exists", () => {
        const violations: ViolationCounts = {
          critical: 0,
          serious: 1,
          moderate: 5,
          minor: 0,
        };

        const result = calculateGrade(violations);

        // Serious cap (79) takes precedence over moderate cap (85)
        expect(result.score).toBeLessThanOrEqual(79);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GRADE BOUNDARIES
  // ═══════════════════════════════════════════════════════════════════════════

  describe("grade boundaries", () => {
    it("returns A for score >= 90", () => {
      // 5 minor = 5 penalty = score 95
      const violations: ViolationCounts = {
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 5,
      };

      expect(calculateGrade(violations).grade).toBe("A");
    });

    it("returns B for score 80-89", () => {
      // 2 moderate + 5 minor = 15 penalty = score 85
      const violations: ViolationCounts = {
        critical: 0,
        serious: 0,
        moderate: 2,
        minor: 5,
      };

      expect(calculateGrade(violations).grade).toBe("B");
    });

    it("returns C for score 70-79", () => {
      // 1 serious, capped at 79
      const violations: ViolationCounts = {
        critical: 0,
        serious: 1,
        moderate: 0,
        minor: 0,
      };

      expect(calculateGrade(violations).grade).toBe("C");
    });

    it("returns D for score 60-69", () => {
      // 3 serious = 36 penalty = score 64, below 79 cap
      // 100 - 36 = 64
      const violations: ViolationCounts = {
        critical: 0,
        serious: 3,
        moderate: 0,
        minor: 0,
      };

      expect(calculateGrade(violations).grade).toBe("D");
    });

    it("returns F for score < 60", () => {
      const violations: ViolationCounts = {
        critical: 2,
        serious: 0,
        moderate: 0,
        minor: 0,
      };

      expect(calculateGrade(violations).grade).toBe("F");
    });

    // Edge cases at exact boundaries
    it("score of exactly 90 returns A", () => {
      // 2 moderate = 10 penalty = score 90
      const violations: ViolationCounts = {
        critical: 0,
        serious: 0,
        moderate: 2,
        minor: 0,
      };

      const result = calculateGrade(violations);
      expect(result.score).toBe(90);
      expect(result.grade).toBe("A");
    });

    it("score of exactly 80 returns B", () => {
      // 4 moderate = 20 penalty = score 80
      // But wait, 3+ moderate caps at 85, so we need different violations
      // Let's use 2 moderate + 10 minor = 10 + 10 = 20 penalty = 80
      const violations: ViolationCounts = {
        critical: 0,
        serious: 0,
        moderate: 2,
        minor: 10,
      };

      const result = calculateGrade(violations);
      expect(result.score).toBe(80);
      expect(result.grade).toBe("B");
    });

    it("score of exactly 70 returns C", () => {
      // Need 30 penalty without triggering serious/critical caps
      // 6 moderate = 30 penalty, but that triggers moderate cap (85)
      // So we'd get min(70, 85) = 70... but let's verify
      const violations: ViolationCounts = {
        critical: 0,
        serious: 0,
        moderate: 6,
        minor: 0,
      };

      const result = calculateGrade(violations);
      expect(result.score).toBe(70);
      expect(result.grade).toBe("C");
    });

    it("score of exactly 60 returns D", () => {
      // Need 40 penalty without triggering critical cap
      // 8 moderate = 40 penalty = score 60
      const violations: ViolationCounts = {
        critical: 0,
        serious: 0,
        moderate: 8,
        minor: 0,
      };

      const result = calculateGrade(violations);
      expect(result.score).toBe(60);
      expect(result.grade).toBe("D");
    });

    it("score of 59 returns F", () => {
      // Need 41 penalty without critical (which caps at 55)
      // 8 moderate + 1 minor = 41 penalty = score 59
      const violations: ViolationCounts = {
        critical: 0,
        serious: 0,
        moderate: 8,
        minor: 1,
      };

      const result = calculateGrade(violations);
      expect(result.score).toBe(59);
      expect(result.grade).toBe("F");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  describe("edge cases", () => {
    it("never returns negative scores", () => {
      const violations: ViolationCounts = {
        critical: 10,
        serious: 10,
        moderate: 10,
        minor: 10,
      };

      const result = calculateGrade(violations);

      expect(result.score).toBe(0);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it("handles extremely high violation counts", () => {
      const violations: ViolationCounts = {
        critical: 100,
        serious: 100,
        moderate: 100,
        minor: 100,
      };

      const result = calculateGrade(violations);

      expect(result.score).toBe(0);
      expect(result.grade).toBe("F");
    });

    it("rounds scores to whole numbers", () => {
      // All our weights are integers, so this should always produce integers
      const violations: ViolationCounts = {
        critical: 0,
        serious: 0,
        moderate: 1,
        minor: 2,
      };

      const result = calculateGrade(violations);

      expect(Number.isInteger(result.score)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REAL-WORLD SCENARIOS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("real-world scenarios", () => {
    it("typical well-maintained site: few minor issues", () => {
      const violations: ViolationCounts = {
        critical: 0,
        serious: 0,
        moderate: 1,
        minor: 3,
      };

      const result = calculateGrade(violations);

      expect(result.grade).toBe("A");
      expect(result.score).toBe(92); // 100 - 5 - 3
    });

    it("needs work: some moderate issues", () => {
      const violations: ViolationCounts = {
        critical: 0,
        serious: 0,
        moderate: 4,
        minor: 5,
      };

      const result = calculateGrade(violations);

      // 100 - 20 - 5 = 75, capped at 85 due to 3+ moderate
      // Score is 75 (below cap), so cap doesn't change it → C grade
      expect(result.score).toBe(75);
      expect(result.grade).toBe("C");
    });

    it("problematic: has serious issues", () => {
      const violations: ViolationCounts = {
        critical: 0,
        serious: 2,
        moderate: 3,
        minor: 5,
      };

      const result = calculateGrade(violations);

      // 100 - 24 - 15 - 5 = 56, capped at 72 due to serious
      // Score is 56 (below cap), so final score is 56 → F grade
      expect(result.score).toBe(56);
      expect(result.grade).toBe("F");
    });

    it("failing: critical accessibility barriers", () => {
      const violations: ViolationCounts = {
        critical: 1,
        serious: 3,
        moderate: 5,
        minor: 10,
      };

      const result = calculateGrade(violations);

      // 100 - 25 - 36 - 25 - 10 = 4, capped at 55 due to critical
      // Score is 4 (below cap), so final score is 4 → F grade
      expect(result.score).toBe(4);
      expect(result.grade).toBe("F");
    });

    it("severely broken: multiple critical issues", () => {
      const violations: ViolationCounts = {
        critical: 3,
        serious: 5,
        moderate: 10,
        minor: 20,
      };

      const result = calculateGrade(violations);

      expect(result.grade).toBe("F");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GRADING VERSION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("GRADING_VERSION constant", () => {
    it("exports a version number", () => {
      expect(typeof GRADING_VERSION).toBe("number");
      expect(GRADING_VERSION).toBeGreaterThan(0);
    });

    it("current version is 3", () => {
      expect(GRADING_VERSION).toBe(3);
    });
  });
});
