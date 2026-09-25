import { describe, it, expect } from "vitest";
import { getSafeCallbackUrl } from "./sign-in";

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
  ])("refuses %s", (input) => {
    const out = getSafeCallbackUrl(input);
    expect(out).toBe("/");
    // Belt and braces: whatever comes back must stay on our origin when navigated to.
    expect(new URL(out, window.location.origin).origin).toBe(window.location.origin);
  });
});
