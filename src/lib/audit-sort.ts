export type SortOption = "date" | "name" | "score";

export interface SortableAudit {
  domain: string;
  scannedAt: number;
  score: number;
}

export function sortAudits<T extends SortableAudit>(
  audits: T[],
  sortBy: SortOption
): T[] {
  return [...audits].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return a.domain.localeCompare(b.domain);
      case "date":
        return b.scannedAt - a.scannedAt;
      case "score":
        return b.score - a.score;
      default:
        return 0;
    }
  });
}
