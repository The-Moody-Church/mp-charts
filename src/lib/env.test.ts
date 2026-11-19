import { describe, it, expect } from "vitest";
import { getAuthBaseUrl, getMpBaseUrl } from "@/lib/env";

/**
 * Audit N19 (upstream MPNext 6616310 + 2227a80, without the NEXTAUTH_URL
 * fallback). Pure readers: the env is passed in, nothing is re-imported.
 */
const dev = (extra: Record<string, string | undefined>) => ({ NODE_ENV: "development", ...extra });
const prod = (extra: Record<string, string | undefined>) => ({ NODE_ENV: "production", ...extra });

describe("getMpBaseUrl", () => {
  const mp = (value: string | undefined, env = dev) => getMpBaseUrl(env({ MINISTRY_PLATFORM_BASE_URL: value }));

  it.each([
    ["https://mp.example.org", "https://mp.example.org"],
    ["https://mp.example.org/", "https://mp.example.org"],
    // Production's shape: the API lives under a path, which is kept.
    ["https://mp.example.org/ministryplatformapi", "https://mp.example.org/ministryplatformapi"],
    ["https://mp.example.org/ministryplatformapi/", "https://mp.example.org/ministryplatformapi"],
    ["https://mp.example.org/ministryplatformapi//", "https://mp.example.org/ministryplatformapi"],
    ["  https://MP.Example.org:8443/api  ", "https://mp.example.org:8443/api"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(mp(input)).toBe(expected);
    expect(mp(input, prod)).toBe(expected);
  });

  it.each([
    [undefined, "is not set"],
    ["", "is not set"],
    ["   ", "is not set"],
    ["mp.example.org", "is not a valid absolute URL"],
    ["http://mp.example.org", "must use https://"],
    ["ftp://mp.example.org", "must use https://"],
    ["https://u:p@mp.example.org", "must not contain credentials"],
    ["https://u@mp.example.org", "must not contain credentials"],
    ["https://mp.example.org?a", "must not contain a query string or fragment"],
    ["https://mp.example.org?", "must not contain a query string or fragment"],
    ["https://mp.example.org/api#frag", "must not contain a query string or fragment"],
    ["https://mp.example.org/api#", "must not contain a query string or fragment"],
  ])("refuses %j (%s)", (input, message) => {
    expect(() => mp(input)).toThrow(`[env] MINISTRY_PLATFORM_BASE_URL ${message}`);
    expect(() => mp(input, prod)).toThrow(`[env] MINISTRY_PLATFORM_BASE_URL ${message}`);
  });

  it.each(["http://localhost:5000", "http://127.0.0.1:5000/api", "http://[::1]:5000"])(
    "allows loopback http outside production only: %s",
    (input) => {
      expect(mp(input)).toBe(input);
      expect(getMpBaseUrl({ MINISTRY_PLATFORM_BASE_URL: input })).toBe(input);
      expect(() => mp(input, prod)).toThrow("[env] MINISTRY_PLATFORM_BASE_URL must use https:// in production.");
    },
  );

  it("does not treat a lookalike host as loopback", () => {
    expect(() => mp("http://localhost.example.org")).toThrow("must use https://");
  });

  it("never echoes the value in the error", () => {
    for (const [value, secret] of [
      ["https://user:hunter2@mp.example.org", "hunter2"],
      ["http://secret-host.example.org", "secret-host"],
      ["https://mp.example.org/?token=abc123", "abc123"],
      ["not a url secret-path", "secret-path"],
    ]) {
      expect(() => mp(value)).toThrow(expect.objectContaining({ message: expect.not.stringContaining(secret) }));
      expect(() => mp(value)).toThrow(/^\[env\] MINISTRY_PLATFORM_BASE_URL /);
    }
  });

  it("reads process.env by default (src/test-setup.ts)", () => {
    expect(getMpBaseUrl()).toBe("https://test-mp.example.com");
  });
});

describe("getAuthBaseUrl", () => {
  it.each([
    ["https://app.example.org", "https://app.example.org"],
    ["https://app.example.org/", "https://app.example.org"],
    ["https://APP.example.org:8443", "https://app.example.org:8443"],
    [" https://app.example.org ", "https://app.example.org"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(getAuthBaseUrl(prod({ BETTER_AUTH_URL: input }))).toBe(expected);
  });

  it("has NO fallback: NEXTAUTH_URL is ignored", () => {
    expect(() => getAuthBaseUrl(prod({ NEXTAUTH_URL: "https://legacy.example.org" }))).toThrow(
      "[env] BETTER_AUTH_URL is not set.",
    );
    expect(() =>
      getAuthBaseUrl(prod({ BETTER_AUTH_URL: " ", NEXTAUTH_URL: "https://legacy.example.org" })),
    ).toThrow("[env] BETTER_AUTH_URL is not set.");
  });

  it.each([
    [undefined, "BETTER_AUTH_URL is not set"],
    ["", "BETTER_AUTH_URL is not set"],
    ["app.example.org", "BETTER_AUTH_URL is not a valid absolute URL"],
    ["http://app.example.org", "BETTER_AUTH_URL must use https://"],
    ["https://u:p@app.example.org", "BETTER_AUTH_URL must not contain credentials"],
    ["https://app.example.org?a", "BETTER_AUTH_URL must not contain a query string or fragment"],
    ["https://app.example.org?", "BETTER_AUTH_URL must not contain a query string or fragment"],
    ["https://app.example.org#x", "BETTER_AUTH_URL must not contain a query string or fragment"],
    ["https://app.example.org/app", "BETTER_AUTH_URL must be an origin only"],
    ["https://app.example.org/api/auth", "BETTER_AUTH_URL must be an origin only"],
    ["https://app.example.org//", "BETTER_AUTH_URL must be an origin only"],
  ])("refuses %j", (input, message) => {
    expect(() => getAuthBaseUrl(dev({ BETTER_AUTH_URL: input }))).toThrow(`[env] ${message}`);
    expect(() => getAuthBaseUrl(prod({ BETTER_AUTH_URL: input }))).toThrow(`[env] ${message}`);
  });

  it("allows loopback http in every environment (a local next start, the tests), but no other http host", () => {
    expect(getAuthBaseUrl(dev({ BETTER_AUTH_URL: "http://localhost:3000" }))).toBe("http://localhost:3000");
    expect(getAuthBaseUrl({ BETTER_AUTH_URL: "http://127.0.0.1:3000/" })).toBe("http://127.0.0.1:3000");
    expect(getAuthBaseUrl(prod({ BETTER_AUTH_URL: "http://localhost:3000" }))).toBe("http://localhost:3000");
    expect(getAuthBaseUrl(prod({ BETTER_AUTH_URL: "http://[::1]:3000" }))).toBe("http://[::1]:3000");
    expect(() => getAuthBaseUrl(prod({ BETTER_AUTH_URL: "http://app.example.org" }))).toThrow(
      "[env] BETTER_AUTH_URL must use https:// (http:// is allowed only for localhost / 127.0.0.1 / [::1]).",
    );
    expect(() => getAuthBaseUrl(prod({ BETTER_AUTH_URL: "http://localhost.example.org" }))).toThrow(
      "BETTER_AUTH_URL must use https://",
    );
    // A LAN host over http is refused in development too.
    expect(() => getAuthBaseUrl(dev({ BETTER_AUTH_URL: "http://192.168.4.81:3000" }))).toThrow(
      "BETTER_AUTH_URL must use https://",
    );
  });

  it("never echoes the value in the error", () => {
    for (const [value, secret] of [
      ["https://user:hunter2@app.example.org", "hunter2"],
      ["http://secret-host.example.org", "secret-host"],
      ["https://app.example.org/secret-path", "secret-path"],
    ]) {
      expect(() => getAuthBaseUrl(prod({ BETTER_AUTH_URL: value }))).toThrow(
        expect.objectContaining({ message: expect.not.stringContaining(secret) }),
      );
    }
  });

  it("reads process.env by default (src/test-setup.ts)", () => {
    expect(getAuthBaseUrl()).toBe("http://localhost:3000");
  });
});
