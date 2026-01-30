/**
 * Re-export grading logic from convex/lib/grading.ts
 * This keeps imports clean in Next.js code (@/lib/grading)
 * while maintaining a single source of truth in the convex folder.
 */
export {
  calculateGrade,
  GRADING_VERSION,
  type ViolationCounts,
  type GradeResult,
} from "../../convex/lib/grading";
