import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import AuthErrorPage from "./page";

/**
 * F7 — this app owns the OAuth failure page rather than better-auth's
 * built-in /api/auth/error (which the route allowlist no longer exposes).
 */
describe("AuthErrorPage", () => {
  const renderWith = async (query: { error?: string }) => {
    await act(async () => {
      render(<AuthErrorPage searchParams={Promise.resolve(query)} />);
    });
  };

  it("maps a known better-auth 1.6 error code to plain English", async () => {
    await renderWith({ error: "user_info_is_missing" });

    expect(screen.getByText(/did not return a usable user record/i)).toBeDefined();
    expect(screen.getByText("user_info_is_missing")).toBeDefined();
  });

  it("falls back to a generic message for an unknown code", async () => {
    await renderWith({ error: "something_we_have_never_seen" });

    expect(screen.getByText(/could not complete your Ministry Platform sign-in/i)).toBeDefined();
  });

  it("renders without any error code at all", async () => {
    await renderWith({});

    expect(screen.getByText(/could not complete your Ministry Platform sign-in/i)).toBeDefined();
  });

  it("NEVER renders error_description", async () => {
    // Provider- and attacker-controlled text reflected in the query string.
    // Rendering it would let a crafted /auth-error link put arbitrary copy on
    // our own domain.
    //
    // Scope of this assertion: it pins that the value is not RENDERED. Next
    // still serializes it into the RSC flight payload along with every other
    // searchParam, which no code here can prevent — that path is safe because
    // Next escapes it (verified live on a soak build, 2026-09-17). Do not
    // read this test as proving the string is absent from the response.
    const injected = "ATTACKER-CONTROLLED-TEXT";
    await act(async () => {
      render(
        <AuthErrorPage
          searchParams={Promise.resolve({
            error: "invalid_code",
            error_description: injected,
          } as { error?: string })}
        />
      );
    });

    expect(screen.queryByText(new RegExp(injected))).toBeNull();
  });

  it("always offers a manual way back to /signin, with no auto-redirect", async () => {
    await renderWith({ error: "invalid_code" });

    const link = screen.getByRole("link", { name: /try signing in again/i });
    expect(link.getAttribute("href")).toBe("/signin");
  });
});
