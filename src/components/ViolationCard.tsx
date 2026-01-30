interface ViolationCardProps {
  violations: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    total: number;
  };
}

export function ViolationCard({ violations }: ViolationCardProps) {
  const categories = [
    {
      label: "Critical",
      count: violations.critical,
      indicator: "!",
      description: "Blocks users completely",
      cssVar: "severity-critical",
    },
    {
      label: "Serious",
      count: violations.serious,
      indicator: "!!",
      description: "Major barriers for users",
      cssVar: "severity-serious",
    },
    {
      label: "Moderate",
      count: violations.moderate,
      indicator: "~",
      description: "Creates difficulties",
      cssVar: "severity-moderate",
    },
    {
      label: "Minor",
      count: violations.minor,
      indicator: "·",
      description: "Small inconveniences",
      cssVar: "severity-minor",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" role="list" aria-label="Violations by severity">
      {categories.map((category) => (
        <div
          key={category.label}
          className="relative overflow-hidden rounded-xl p-5 border transition-transform hover:scale-[1.02]"
          style={{
            backgroundColor: `var(--${category.cssVar}-bg)`,
            borderColor: `var(--${category.cssVar}-border)`,
          }}
          role="listitem"
          aria-label={`${category.count} ${category.label.toLowerCase()} violations: ${category.description}`}
        >
          <div className="relative z-10">
            <div className="flex items-baseline gap-2 mb-1">
              <span
                className="text-4xl font-display font-bold"
                style={{ color: `var(--${category.cssVar})` }}
              >
                {category.count}
              </span>
              <span
                className="text-sm font-bold opacity-60"
                style={{ color: `var(--${category.cssVar})` }}
                aria-hidden="true"
              >
                {category.indicator}
              </span>
            </div>
            <div className="text-sm font-semibold text-theme-primary mb-1">
              {category.label}
            </div>
            <div className="text-xs text-theme-muted">{category.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
