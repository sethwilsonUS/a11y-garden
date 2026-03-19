const TOKEN_BYTES = 32;

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generateAuditAccessToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hashAuditAccessToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

export function getExtensionViewTokenStorageKey(auditId: string): string {
  return `a11y-garden:view-token:${auditId}`;
}
