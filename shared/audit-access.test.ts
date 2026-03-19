import { describe, expect, it } from "vitest";
import {
  generateAuditAccessToken,
  getExtensionViewTokenStorageKey,
  hashAuditAccessToken,
} from "./audit-access";

describe("audit-access", () => {
  it("generates distinct hex tokens", () => {
    const first = generateAuditAccessToken();
    const second = generateAuditAccessToken();

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
  });

  it("hashes a token deterministically", async () => {
    const token = "abc123";
    const first = await hashAuditAccessToken(token);
    const second = await hashAuditAccessToken(token);

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(second);
  });

  it("builds the extension session-storage key", () => {
    expect(getExtensionViewTokenStorageKey("audit-1")).toBe(
      "a11y-garden:view-token:audit-1",
    );
  });
});
