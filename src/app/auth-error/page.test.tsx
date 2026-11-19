import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import AuthErrorPage from "./page";
import { CODE_SHAPE, ERROR_MESSAGES } from "./error-codes";

/**
 * F7 — this app owns the OAuth failure page rather than better-auth's
 * built-in /api/auth/error (which the route allowlist no longer exposes).
 */
describe("AuthErrorPage", () => {
  const renderWith = async (query: { error?: string | string[] }) => {
    await act(async () => {
      render(<AuthErrorPage searchParams={Promise.resolve(query)} />);
    });
  };

  it("maps a known better-auth 1.7 error code to plain English", async () => {
    await renderWith({ error: "unable_to_get_user_info" });

    expect(screen.getByText(/could not read a usable user record/i)).toBeDefined();
    expect(screen.getByText("unable_to_get_user_info")).toBeDefined();
  });

  it.each(["oauth_provider_not_found", "sign_in_start_failed", "state_mismatch", "invalid_code"])(
    "maps %s to a specific (non-fallback) message",
    async (code) => {
      await renderWith({ error: code });

      expect(screen.queryByText(/could not complete your Ministry Platform sign-in/i)).toBeNull();
      expect(screen.getByText(code)).toBeDefined();
    }
  );

  it("falls back to a generic message for an unknown code", async () => {
    await renderWith({ error: "something_we_have_never_seen" });

    expect(screen.getByText(/could not complete your Ministry Platform sign-in/i)).toBeDefined();
  });

  it.each(["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"])(
    "falls back to the generic message for the Object.prototype key %s",
    async (code) => {
      // The map is a plain object literal indexed with untrusted query input.
      // Without an own-key check, ?error=__proto__ resolves to Object.prototype
      // (render throws: "Objects are not valid as a React child") and
      // ?error=constructor resolves to a function (the message paragraph
      // renders empty and the fallback is skipped).
      await renderWith({ error: code });

      expect(screen.getByText(/could not complete your Ministry Platform sign-in/i)).toBeDefined();
      expect(screen.getByText(code)).toBeDefined();
    }
  );

  // Upstream MPNext 6aa1633, adapted: echo only something shaped like a code.
  describe("echoes ?error= only when it looks like a machine code", () => {
    const FALLBACK = /could not complete your Ministry Platform sign-in/i;
    const echoed = () => document.querySelector("code");

    it.each([
      ["a sentence", "Your account is locked. Call 555-0100"],
      ["a hyphen", "state-mismatch"],
      ["a dot", "state.mismatch"],
      ["a space", "state mismatch"],
      ["markup", "<b>hi</b>"],
      ["a known code with a trailing newline", "state_mismatch\n"],
      ["65 characters", "a".repeat(65)],
    ])("does not echo %s, and shows the fallback", async (_label, value) => {
      await renderWith({ error: value });

      expect(screen.getByText(FALLBACK)).toBeDefined();
      expect(echoed()).toBeNull();
      expect(document.body.textContent).not.toContain("555-0100");
    });

    it("does not echo a repeated parameter (an array), even of known codes", async () => {
      await renderWith({ error: ["state_mismatch", "invalid_code"] });

      expect(screen.getByText(FALLBACK)).toBeDefined();
      expect(echoed()).toBeNull();
      expect(document.body.textContent).not.toContain("state_mismatch");
    });

    it("does not echo a one-element array, which only the typeof guard stops", async () => {
      // RegExp.test(["state_mismatch"]) coerces to "state_mismatch" and passes
      // CODE_SHAPE, so this case fails if the string check is removed.
      await renderWith({ error: ["state_mismatch"] });

      expect(screen.getByText(FALLBACK)).toBeDefined();
      expect(echoed()).toBeNull();
      expect(document.body.textContent).not.toContain("state_mismatch");
    });

    it("still echoes an unknown but well-formed code, so support can see it", async () => {
      const code = `future_code_${"x".repeat(52)}`; // exactly 64 characters
      expect(code).toHaveLength(64);
      await renderWith({ error: code });

      expect(screen.getByText(FALLBACK)).toBeDefined();
      expect(echoed()?.textContent).toBe(code);
    });

    it("maps and echoes our own upper-case MISSING_FIELD", async () => {
      await renderWith({ error: "MISSING_FIELD" });

      expect(screen.getByText(/missing a required identifier/i)).toBeDefined();
      expect(echoed()?.textContent).toBe("MISSING_FIELD");
    });

    it.each(Object.keys(ERROR_MESSAGES))("every mapped code matches CODE_SHAPE: %s", (code) => {
      expect(CODE_SHAPE.test(code)).toBe(true);
    });

    it("pins CODE_SHAPE itself", () => {
      expect(CODE_SHAPE.source).toBe("^[A-Za-z0-9_]{1,64}$");
      expect(CODE_SHAPE.flags).toBe("");
    });
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
