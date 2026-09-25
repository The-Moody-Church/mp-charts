import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { MP_PROVIDER_ID } from "@/lib/auth-endsession";
import type { GenericOAuthConfig } from "better-auth/plugins";
import { auth } from "@/lib/auth";

function mpConfig(): GenericOAuthConfig {
  const plugin = auth.options.plugins?.find((p) => p.id === "generic-oauth") as
    | { options?: { config?: GenericOAuthConfig[] } }
    | undefined;
  const cfg = plugin?.options?.config?.find((c) => c.providerId === MP_PROVIDER_ID);
  if (!cfg) throw new Error("ministryplatform genericOAuth config not found");
  return cfg;
}

/**
 * OAuth scope guard.
 *
 * Asserts on BOTH the source and the runtime config. The real provider config
 * IS reachable at runtime, on 1.6 and 1.7 alike, via
 * `auth.options.plugins.find(p => p.id === "generic-oauth").options.config`.
 * (An earlier version of this comment claimed otherwise; that was wrong.)
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
    // static 30-day credential that was never redeemed. (Sign-in runs on the
    // TM.Widgets client, whose refresh settings have not been read; the
    // scope stays gone regardless.)
    //
    // If something later genuinely needs to act as the user after sign-in,
    // add it deliberately and change this test in the same commit.
    expect(declaredScopes()).not.toContain("offline_access");
  });

  it("the RUNTIME provider config requests exactly those two", () => {
    expect(mpConfig().scopes).toEqual([
      "openid",
      "http://www.thinkministry.com/dataplatform/scopes/all",
    ]);
  });

  it("requests nothing beyond those two", () => {
    // A scope list is easy to grow by accident. Every entry should be here
    // because something needs it.
    expect(declaredScopes().sort()).toEqual(
      ["http://www.thinkministry.com/dataplatform/scopes/all", "openid"].sort()
    );
  });
});
