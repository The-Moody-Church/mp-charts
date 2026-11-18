import { describe, it, expect } from "vitest";
import nextConfig from "../../next.config";

/**
 * Pins the security-relevant settings in next.config.ts. The option SET is
 * pinned separately in src/test-only-imports.test.ts; this pins the values.
 */
describe("next.config.ts security settings", () => {
  // N14 (upstream MPNext 9904f67).
  it("sends no X-Powered-By header", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("turns the image optimizer off, so /_next/image answers 404", () => {
    expect(nextConfig.images).toEqual({ unoptimized: true });
  });

  it("does not log Server Function arguments in next dev", () => {
    expect(nextConfig.logging).toEqual({ serverFunctions: false });
  });

  // F14, pinned since upstream MPNext 6e160a3 added the same test.
  it("sends the static security headers on every path, and no CSP", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/(.*)");
    const headers = Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
    expect(headers).toMatchObject({
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    });
    // The CSP is per-request (it carries a nonce), so it lives in src/proxy.ts.
    const keys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(keys).not.toContain("content-security-policy");
    expect(keys).not.toContain("content-security-policy-report-only");
  });
});
