/**
 * Grading Algorithm v2 - Hybrid Approach
 * 
 * Single source of truth for grading logic.
 * Used by both Convex functions and Next.js app.
 * 
 * Combines weighted penalties with hard caps to ensure
 * serious accessibility issues are reflected in grades.
 */

// Increment this when changing the algorithm to trigger lazy recalculation
export const GRADING_VERSION = 2;

export interface ViolationCounts {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
}

export interface GradeResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
}

/**
 * Calculate accessibility grade using hybrid approach:
 * 1. Start with weighted penalty system
 * 2. Apply hard caps based on violation severity
 */
export function calculateGrade(violations: ViolationCounts): GradeResult {
  // Weights for each severity level
  const weights = {
    critical: 25,
    serious: 12,
    moderate: 5,
    minor: 1,
  };

  // Calculate base penalty
  const penalty =
    violations.critical * weights.critical +
    violations.serious * weights.serious +
    violations.moderate * weights.moderate +
    violations.minor * weights.minor;

  // Start with penalty-based score
  let score = Math.max(0, Math.round(100 - penalty));

  // Apply hard caps - certain issues prevent high grades
  // Critical issues: max grade F (score capped at 55)
  if (violations.critical > 0) {
    score = Math.min(score, 55);
  }
  // Serious issues: max grade C (score capped at 72)
  else if (violations.serious > 0) {
    score = Math.min(score, 72);
  }
  // 3+ moderate issues: max grade B (score capped at 85)
  else if (violations.moderate >= 3) {
    score = Math.min(score, 85);
  }

  // Determine letter grade
  let grade: GradeResult["grade"];
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 70) grade = "C";
  else if (score >= 60) grade = "D";
  else grade = "F";

  return { score, grade };
}
