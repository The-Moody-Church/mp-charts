import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * OAuth scope guard.
 *
 * Asserts on the SOURCE rather than on `auth.options`, deliberately:
 * better-auth's genericOAuth plugin does not expose its provider config on the
 * instance — `plugins.find(p => p.id === "generic-oauth")` resolves, but the
 * provider array under it does not — so there is nothing to read at runtime.
 * Probed before writing this, rather than assumed.
 *
 * Worth pinning anyway, because the failure is silent. Adding a scope back
 * changes nothing visible: sign-in still works, nothing errors, and MP simply
 * starts minting a credential nobody asked for.
 */
const AUTH = "src/lib/auth.ts";
const read = () => readFileSync(resolve(process.cwd(), AUTH), "utf8");

/** The `scopes: [...]` array as written in the genericOAuth provider config. */
function declaredScopes(): string[] {
  const m = read().match(/scopes:\s*\[([^\]]*)\]/);
  if (!m) throw new Error("no scopes array found in " + AUTH);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

describe("Ministry Platform OAuth scopes", () => {
  it("requests openid, which the whole identity flow depends on", () => {
    // Without it MP issues no ID token, and sign-out loses `id_token_hint`.
    expect(declaredScopes()).toContain("openid");
  });

  it("requests the MP data-platform scope", () => {
    expect(declaredScopes()).toContain(
      "http://www.thinkministry.com/dataplatform/scopes/all"
    );
  });

  it("does NOT request offline_access", () => {
    // Removed 2026-09-22. The refresh token it bought was never used — zero
    // references in src/, and better-auth's refresh endpoints are not on the
    // deny-by-default allowlist, so they 404 before reaching it.
    //
    // The cost was real: MP's `MPNext` client sets a 43200-minute (30-day)
    // refresh token lifetime with rotation OFF, so every sign-in minted a
    // static 30-day credential that was never redeemed.
    //
    // If something later genuinely needs to act as the user after sign-in,
    // add it deliberately and change this test in the same commit.
    expect(declaredScopes()).not.toContain("offline_access");
  });

  it("requests nothing beyond those two", () => {
    // A scope list is easy to grow by accident. Every entry should be here
    // because something needs it.
    expect(declaredScopes().sort()).toEqual(
      ["http://www.thinkministry.com/dataplatform/scopes/all", "openid"].sort()
    );
  });
});
