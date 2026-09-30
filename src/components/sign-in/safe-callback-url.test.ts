import { describe, it, expect } from "vitest";
import { getSafeCallbackUrl } from "./sign-in";
import { MAX_CALLBACK_URL_LENGTH, MAX_SIGN_IN_CALLBACK_URL_LENGTH } from "@/lib/auth-callback-url";

/**
 * getSafeCallbackUrl decides where /signin sends a user who is ALREADY signed
 * in (`window.location.href = callbackUrl`), so anything it returns must be a
 * same-origin path — never a string a browser reads as another host.
 *
 * jsdom's origin in this suite is http://localhost:3000.
 */
describe("getSafeCallbackUrl", () => {
  it.each([
    ["/", "/"],
    ["/dashboard", "/dashboard"],
    ["/reports?year=2026#top", "/reports?year=2026#top"],
    ["/reports/a/../b", "/reports/b"],
  ])("keeps same-origin path %s", (input, expected) => {
    expect(getSafeCallbackUrl(input)).toBe(expected);
  });

  it.each([
    [null],
    [""],
  ])("falls back to / for %p", (input) => {
    expect(getSafeCallbackUrl(input)).toBe("/");
  });

  it.each([
    // Off-site in the input itself.
    "https://evil.example/",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/ok\x00",
    // Dot segments that resolve ON our origin to a protocol-relative pathname.
    // Each of these returned "//evil.example" before the output check.
    "/.//evil.example",
    "/..//evil.example",
    "/a/..//evil.example",
    "/%2e//evil.example",
    "/%2E%2E//evil.example",
    // WHATWG URL parsing strips tab/LF/CR anywhere in the input, so each of
    // these parses as "//evil.example" (or "/\evil.example") AFTER any string
    // check that looked for "//" — the control-character rule refuses them.
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "/\t\\evil.example",
    // A blob: URL's origin is the embedded one.
    "blob:https://evil.example/0b1c2d3e-0000-4000-8000-000000000000",
  ])("refuses %j", (input) => {
    const out = getSafeCallbackUrl(input);
    expect(out).toBe("/");
    // Belt and braces: whatever comes back must stay on our origin when navigated to.
    expect(new URL(out, window.location.origin).origin).toBe(window.location.origin);
  });

  // better-auth copies the callback into the oauth_state cookie at ~2 bytes a
  // character, and browsers drop that cookie past ~1754 characters (the MP
  // callback then fails with state_mismatch); the /sign-in/social body filter
  // (route.ts) 404s one over 2048. Either way the user would land on
  // /auth-error. The page must never send one: an overlong deep link falls
  // back to "/" and still signs in.
  it("keeps a callback of exactly 1536 characters and replaces a longer one with /", () => {
    expect(MAX_SIGN_IN_CALLBACK_URL_LENGTH).toBe(1536);
    const atLimit = "/" + "a".repeat(1535);
    expect(getSafeCallbackUrl(atLimit)).toBe(atLimit);
    expect(getSafeCallbackUrl("/" + "a".repeat(1536))).toBe("/");
    // A callback the server cap would still accept is replaced too.
    expect(getSafeCallbackUrl("/" + "a".repeat(2047))).toBe("/");
  });

  it("keeps the page's limit below the server cap", () => {
    expect(MAX_CALLBACK_URL_LENGTH).toBe(2048);
    expect(MAX_SIGN_IN_CALLBACK_URL_LENGTH).toBeLessThan(MAX_CALLBACK_URL_LENGTH);
  });

  it("measures the limit on what it sends, after URL normalization", () => {
    // Each embedded space is percent-encoded to 3 characters. 522 characters
    // in, 1562 out: over the limit.
    const over = "/" + " ".repeat(520) + "x";
    expect(over.length).toBeLessThanOrEqual(1536);
    expect(getSafeCallbackUrl(over)).toBe("/");
    // Control: 502 in, 1502 out — under the limit, returned encoded.
    expect(getSafeCallbackUrl("/" + " ".repeat(500) + "x")).toBe("/" + "%20".repeat(500) + "x");
  });

  it("refuses the value URLSearchParams decodes from callbackUrl=/%09/evil.example", () => {
    // What the sign-in page actually reads: searchParams.get() decodes %09 to
    // a literal tab.
    const raw = new URLSearchParams("callbackUrl=/%09/evil.example").get("callbackUrl");
    expect(raw).toBe("/\t/evil.example");
    expect(getSafeCallbackUrl(raw)).toBe("/");
  });
});
