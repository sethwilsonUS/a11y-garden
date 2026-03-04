import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSetAuth = vi.fn();

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class MockConvexHttpClient {
    url: string;
    constructor(url: string) {
      this.url = url;
    }
    setAuth = mockSetAuth;
  },
}));

describe("getConvexClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns null when CONVEX_URL is not set", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "");
    const { getConvexClient } = await import("./convex-server");
    expect(getConvexClient()).toBeNull();
    vi.unstubAllEnvs();
  });

  it("creates a client without auth when no token provided", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://test.convex.cloud");
    const { getConvexClient } = await import("./convex-server");
    const client = getConvexClient();
    expect(client).not.toBeNull();
    expect(mockSetAuth).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("sets auth when a token is provided", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://test.convex.cloud");
    const { getConvexClient } = await import("./convex-server");
    const client = getConvexClient("jwt-token-123");
    expect(client).not.toBeNull();
    expect(mockSetAuth).toHaveBeenCalledWith("jwt-token-123");
    vi.unstubAllEnvs();
  });

  it("does not set auth for null token", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://test.convex.cloud");
    const { getConvexClient } = await import("./convex-server");
    const client = getConvexClient(null);
    expect(client).not.toBeNull();
    expect(mockSetAuth).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
