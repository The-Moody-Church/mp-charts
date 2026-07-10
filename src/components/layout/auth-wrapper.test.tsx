import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * AuthWrapper guard tests.
 *
 * AuthWrapper is the server-side auth guard for the (web) route group. It must:
 * - redirect unauthenticated requests to /signin
 * - redirect authenticated-but-broken sessions (no userGuid) to /session-error,
 *   so a user whose session lacks a userGuid still has a way to sign out. This
 *   is the safety net behind the better-auth 1.6 userGuid regression — see
 *   src/lib/auth.test.ts and the userAdditionalFields comment in src/lib/auth.ts.
 * - render children for healthy sessions
 */

const { mockGetSession, mockRedirect } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  // Mirror next/navigation's redirect(), which halts execution by throwing.
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

import { AuthWrapper } from "./auth-wrapper";

describe("AuthWrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /signin when there is no session", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(AuthWrapper({ children: null })).rejects.toThrow("REDIRECT:/signin");
    expect(mockRedirect).toHaveBeenCalledWith("/signin");
  });

  it("redirects to /session-error when the session has no userGuid", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "ba-internal-id", name: "No Guid", email: "x@example.com" },
    });

    await expect(AuthWrapper({ children: null })).rejects.toThrow(
      "REDIRECT:/session-error",
    );
    expect(mockRedirect).toHaveBeenCalledWith("/session-error");
  });

  it("redirects to /session-error when userGuid is null", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "ba-internal-id", userGuid: null },
    });

    await expect(AuthWrapper({ children: null })).rejects.toThrow(
      "REDIRECT:/session-error",
    );
  });

  it("renders children when the session has a userGuid", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "ba-internal-id", userGuid: "ab12cd34-ef56-7890-abcd-ef1234567890" },
    });

    const result = await AuthWrapper({ children: "CONTENT" });

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});
