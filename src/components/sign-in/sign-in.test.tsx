import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const { mockUseSession, mockSocial, search } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockSocial: vi.fn(),
  search: { params: new URLSearchParams() },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: mockUseSession, signIn: { social: mockSocial } },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => search.params,
}));

import { SignIn } from "./sign-in";
import { MP_PROVIDER_ID } from "@/lib/auth-endsession";
import { allowedSignInSocialKeys } from "@/app/api/auth/[...all]/route";

/**
 * Behaviour of the ONLY sign-in entry point. `src/app/signin/page.test.tsx`
 * pins the source shape; these pin what actually happens, because a wrong
 * call shape here breaks every sign-in and still type-checks (`provider` is
 * typed as any string).
 */
describe("SignIn", () => {
  const assign = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    search.params = new URLSearchParams("callbackUrl=/reports");
    // jsdom's Location members are non-configurable, so stub the whole object.
    vi.stubGlobal("location", { origin: "http://localhost:3000", href: "http://localhost:3000/signin", assign });
    mockUseSession.mockReturnValue({ data: null, isPending: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts the MP flow with exactly the body the route's filter allows", async () => {
    mockSocial.mockResolvedValue({ data: { url: "https://mp.example/authorize" }, error: null });

    render(<SignIn />);

    await waitFor(() => expect(mockSocial).toHaveBeenCalledTimes(1));
    const arg = mockSocial.mock.calls[0][0];
    expect(arg).toEqual({ provider: MP_PROVIDER_ID, callbackURL: "/reports" });
    // Drift guard: any extra key would get our 404 from route.ts.
    expect(Object.keys(arg).sort()).toEqual([...allowedSignInSocialKeys].sort());
    expect(assign).not.toHaveBeenCalled();
  });

  it("sends a user whose flow cannot start to /auth-error, not an endless spinner", async () => {
    mockSocial.mockResolvedValue({ data: null, error: { status: 429, message: "Too many requests" } });

    render(<SignIn />);

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/auth-error?error=sign_in_start_failed"));
  });

  it("does the same when the sign-in request itself rejects", async () => {
    mockSocial.mockRejectedValue(new TypeError("Failed to fetch"));

    render(<SignIn />);

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/auth-error?error=sign_in_start_failed"));
  });

  it("does not start a flow while the session is still loading", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });

    render(<SignIn />);

    expect(mockSocial).not.toHaveBeenCalled();
  });

  it("sends an already-signed-in user to the safe callback URL without starting a flow", async () => {
    mockUseSession.mockReturnValue({ data: { user: { id: "u" } }, isPending: false });

    render(<SignIn />);

    await waitFor(() => expect(window.location.href).toBe("/reports"));
    expect(mockSocial).not.toHaveBeenCalled();
  });

  it("falls back to / for an off-site callbackUrl", async () => {
    search.params = new URLSearchParams("callbackUrl=https://evil.example/");
    mockSocial.mockResolvedValue({ data: { url: "https://mp.example/authorize" }, error: null });

    render(<SignIn />);

    await waitFor(() => expect(mockSocial).toHaveBeenCalledTimes(1));
    expect(mockSocial.mock.calls[0][0].callbackURL).toBe("/");
  });
});
