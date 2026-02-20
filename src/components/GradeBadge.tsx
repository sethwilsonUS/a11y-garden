interface GradeBadgeProps {
  grade: "A" | "B" | "C" | "D" | "F";
  score: number;
  size?: "sm" | "md" | "lg";
}

// Garden-inspired grade labels — encouraging
const gradeLabels = {
  A: "Thriving",
  B: "Growing well",
  C: "Needs tending",
  D: "Needs care",
  F: "Needs attention",
};

// Grade indicator shapes/icons (not color-only)
const gradeIndicators = {
  A: "✓",
  B: "↗",
  C: "~",
  D: "↘",
  F: "!",
};

const sizeStyles = {
  sm: {
    container: "px-3 py-2",
    gap: "gap-2",
    grade: "text-2xl",
    label: "text-xs",
    score: "text-xs",
    indicator: "text-xs",
  },
  md: {
    container: "px-6 py-4",
    gap: "gap-4",
    grade: "text-5xl",
    label: "text-sm",
    score: "text-xs",
    indicator: "text-sm",
  },
  lg: {
    container: "px-8 py-6",
    gap: "gap-4",
    grade: "text-7xl",
    label: "text-base",
    score: "text-sm",
    indicator: "text-base",
  },
};

export function GradeBadge({ grade, score, size = "md" }: GradeBadgeProps) {
  const sizeStyle = sizeStyles[size];

  return (
    <div
      className={`inline-flex flex-shrink-0 items-center ${sizeStyle.gap} ${sizeStyle.container} rounded-2xl border-2 bg-[var(--accent-bg)] border-[var(--accent-border)] shadow-lg`}
      role="status"
      aria-label={`Accessibility grade: ${grade} — ${gradeLabels[grade]} — Score: ${score} out of 100`}
    >
      <div className="text-center">
        <span className={`${sizeStyle.grade} font-display font-bold text-accent block leading-none`}>
          {grade}
        </span>
        <span className={`${sizeStyle.indicator} text-theme-muted`} aria-hidden="true">
          {gradeIndicators[grade]}
        </span>
      </div>
      <div className={`text-left ${size === "sm" ? "hidden sm:block" : ""}`}>
        <div className={`${sizeStyle.label} font-medium text-theme-secondary`}>
          {gradeLabels[grade]}
        </div>
        <div className={`${sizeStyle.score} text-theme-muted`}>
          Score: {score}/100
        </div>
      </div>
    </div>
  );
}
