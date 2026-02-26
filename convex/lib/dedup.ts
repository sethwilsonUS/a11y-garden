export interface DedupableAudit {
  url: string;
  scannedAt: number;
}

/**
 * Deduplicate audits by URL, keeping only the one with the highest
 * `scannedAt` for each unique URL.
 */
export function deduplicateByUrl<T extends DedupableAudit>(audits: T[]): T[] {
  const latestByUrl = new Map<string, T>();
  for (const audit of audits) {
    const existing = latestByUrl.get(audit.url);
    if (!existing || audit.scannedAt > existing.scannedAt) {
      latestByUrl.set(audit.url, audit);
    }
  }
  return Array.from(latestByUrl.values());
}
