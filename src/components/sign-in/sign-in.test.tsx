import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";

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
import { clearSignInLoop, SIGN_IN_LOOP_STORAGE_KEY, SIGN_IN_LOOP_WINDOW_MS } from "@/lib/sign-in-loop";

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
    // The loop cap counts automatic navigations per tab in sessionStorage,
    // which jsdom keeps across tests.
    clearSignInLoop();
    search.params = new URLSearchParams("callbackUrl=/reports");
    // jsdom's Location members are non-configurable, so stub the whole object.
    vi.stubGlobal("location", { origin: "http://localhost:3000", href: "http://localhost:3000/signin", assign });
    mockUseSession.mockReturnValue({ data: null, isPending: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  // better-auth stores callbackURL in the oauth_state cookie (~2 bytes a
  // character), which the browser drops past ~1754 characters, and the route
  // filter 404s one over 2048. Either would land the user on /auth-error; they
  // should sign in and reach home instead.
  it.each([1537, 2048, 3000])(
    "starts the flow with / for a %i-character deep link",
    async (length) => {
      const deepLink = "/reports?q=" + "a".repeat(length - "/reports?q=".length);
      expect(deepLink).toHaveLength(length);
      search.params = new URLSearchParams({ callbackUrl: deepLink });
      mockSocial.mockResolvedValue({ data: { url: "https://mp.example/authorize" }, error: null });

      render(<SignIn />);

      await waitFor(() => expect(mockSocial).toHaveBeenCalledTimes(1));
      expect(mockSocial.mock.calls[0][0]).toEqual({ provider: MP_PROVIDER_ID, callbackURL: "/" });
      expect(assign).not.toHaveBeenCalled();
    }
  );

  it("keeps a 1536-character deep link", async () => {
    const deepLink = "/reports?q=" + "a".repeat(1536 - "/reports?q=".length);
    search.params = new URLSearchParams({ callbackUrl: deepLink });
    mockSocial.mockResolvedValue({ data: { url: "https://mp.example/authorize" }, error: null });

    render(<SignIn />);

    await waitFor(() => expect(mockSocial).toHaveBeenCalledTimes(1));
    expect(mockSocial.mock.calls[0][0]).toEqual({ provider: MP_PROVIDER_ID, callbackURL: deepLink });
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

  it("starts exactly one flow across re-renders: pending -> settled, then again, then a session object", async () => {
    mockSocial.mockResolvedValue({ data: { url: "https://mp.example/authorize" }, error: null });
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    const { rerender } = render(<SignIn />);
    expect(mockSocial).not.toHaveBeenCalled();

    mockUseSession.mockReturnValue({ data: null, isPending: false });
    rerender(<SignIn />);
    await waitFor(() => expect(mockSocial).toHaveBeenCalledTimes(1));
    expect(JSON.parse(sessionStorage.getItem(SIGN_IN_LOOP_STORAGE_KEY)!)).toHaveLength(1);

    // better-auth refetches (visibility, online): pending, then settled again.
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    rerender(<SignIn />);
    mockUseSession.mockReturnValue({ data: null, isPending: false });
    rerender(<SignIn />);
    // ...and a session appears before the MP redirect lands.
    mockUseSession.mockReturnValue({ data: { user: { id: "u" } }, isPending: false });
    rerender(<SignIn />);
    await act(async () => {});

    expect(mockSocial).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem(SIGN_IN_LOOP_STORAGE_KEY)!)).toHaveLength(1);
    expect(window.location.href).toBe("http://localhost:3000/signin");
    expect(assign).not.toHaveBeenCalled();
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

  // Upstream MPNext 595ecab, adapted: the third AUTOMATIC navigation within two
  // minutes is refused, so /signin cannot keep restarting the MP flow (or keep
  // bouncing) on its own. It does not cap a guard -> /signin -> callback cycle:
  // SessionGuard clears the counter on every live session (see sign-in-loop.ts).
  describe("loop cap", () => {
    const T = 1_800_000_000_000;

    const visitSignIn = () => render(<SignIn />);

    it("starts the flow twice, then shows the stop state and does not call signIn.social", async () => {
      vi.spyOn(Date, "now").mockReturnValue(T);
      mockSocial.mockResolvedValue({ data: { url: "https://mp.example/authorize" }, error: null });

      visitSignIn().unmount();
      await waitFor(() => expect(mockSocial).toHaveBeenCalledTimes(1));
      visitSignIn().unmount();
      await waitFor(() => expect(mockSocial).toHaveBeenCalledTimes(2));

      visitSignIn();

      expect(await screen.findByText(/sign-in keeps restarting/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /what to do next/i })).toHaveAttribute(
        "href",
        "/auth-error?error=sign_in_loop"
      );
      expect(mockSocial).toHaveBeenCalledTimes(2);
      expect(assign).not.toHaveBeenCalled();
    });

    it("counts the already-signed-in bounce as an automatic navigation too", async () => {
      vi.spyOn(Date, "now").mockReturnValue(T);
      mockUseSession.mockReturnValue({ data: { user: { id: "u" } }, isPending: false });

      visitSignIn().unmount();
      visitSignIn().unmount();
      expect(window.location.href).toBe("/reports");
      const third = { origin: "http://localhost:3000", href: "http://localhost:3000/signin", assign };
      vi.stubGlobal("location", third);

      visitSignIn();

      expect(await screen.findByText(/sign-in keeps restarting/i)).toBeInTheDocument();
      expect(third.href).toBe("http://localhost:3000/signin");
    });

    it("allows the flow again once the window has passed", async () => {
      const now = vi.spyOn(Date, "now").mockReturnValue(T);
      mockSocial.mockResolvedValue({ data: { url: "https://mp.example/authorize" }, error: null });
      visitSignIn().unmount();
      visitSignIn().unmount();
      await waitFor(() => expect(mockSocial).toHaveBeenCalledTimes(2));

      now.mockReturnValue(T + SIGN_IN_LOOP_WINDOW_MS + 1);
      visitSignIn();

      await waitFor(() => expect(mockSocial).toHaveBeenCalledTimes(3));
      expect(screen.queryByText(/sign-in keeps restarting/i)).toBeNull();
    });

    it("still signs in normally when sessionStorage throws", async () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });
      mockSocial.mockResolvedValue({ data: { url: "https://mp.example/authorize" }, error: null });

      for (let i = 1; i <= 4; i++) {
        visitSignIn().unmount();
        await waitFor(() => expect(mockSocial).toHaveBeenCalledTimes(i));
      }
      expect(screen.queryByText(/sign-in keeps restarting/i)).toBeNull();
    });

    it("'Try again' on the stop state clears the cap and reloads (a person, not a loop)", async () => {
      vi.spyOn(Date, "now").mockReturnValue(T);
      const reload = vi.fn();
      vi.stubGlobal("location", {
        origin: "http://localhost:3000",
        href: "http://localhost:3000/signin",
        assign,
        reload,
      });
      mockSocial.mockResolvedValue({ data: { url: "https://mp.example/authorize" }, error: null });
      visitSignIn().unmount();
      visitSignIn().unmount();
      visitSignIn();
      await screen.findByText(/sign-in keeps restarting/i);

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /try again/i }));
      });

      expect(reload).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem(SIGN_IN_LOOP_STORAGE_KEY)).toBeNull();
    });
  });
});
