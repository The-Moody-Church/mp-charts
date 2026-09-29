import { describe, it, expect } from "vitest";
import { buildEndSessionUrl, MP_PROVIDER_ID } from "./auth-endsession";
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

const BASE = "https://moody.ministryplatform.com/ministryplatformapi";
const APP = "https://app.example.org";

/** Parses the built URL so assertions read as intent rather than string matching. */
function parse(url: string) {
  const u = new URL(url);
  return { path: u.origin + u.pathname, params: u.searchParams };
}

describe("buildEndSessionUrl", () => {
  it("targets the endpoint MP advertises in its discovery document", () => {
    // MINISTRY_PLATFORM_BASE_URL already carries the /ministryplatformapi
    // segment, so this must NOT add its own. Checked against the live tenant.
    expect(parse(buildEndSessionUrl({ baseUrl: BASE, postLogoutUri: APP })).path).toBe(
      "https://moody.ministryplatform.com/ministryplatformapi/oauth/connect/endsession"
    );
  });

  it("sends id_token_hint when a token is available", () => {
    // This is the whole point. MP runs IdentityServer, which honours
    // post_logout_redirect_uri ONLY when id_token_hint identifies the client.
    // Without it MP discards the redirect and strands the user on its own page.
    const { params } = parse(
      buildEndSessionUrl({ baseUrl: BASE, postLogoutUri: APP, idToken: "eyJhbGci.payload.sig" })
    );
    expect(params.get("id_token_hint")).toBe("eyJhbGci.payload.sig");
    expect(params.get("post_logout_redirect_uri")).toBe(APP);
  });

  it("still produces a usable URL with no token", () => {
    // Sign-out must never depend on the hint. The in-memory adapter loses the
    // account on a container restart, so null is a NORMAL state. The user is
    // still signed out; they just land on MP's page instead of back here.
    const { path, params } = parse(buildEndSessionUrl({ baseUrl: BASE, postLogoutUri: APP }));
    expect(path).toContain("/oauth/connect/endsession");
    expect(params.has("id_token_hint")).toBe(false);
    expect(params.get("post_logout_redirect_uri")).toBe(APP);
  });

  it("treats an empty-string token as absent, not as a hint", () => {
    // `id_token_hint=` would be worse than omitting it: MP would parse an
    // empty assertion rather than fall back cleanly.
    const { params } = parse(
      buildEndSessionUrl({ baseUrl: BASE, postLogoutUri: APP, idToken: "" })
    );
    expect(params.has("id_token_hint")).toBe(false);
  });

  it("encodes both parameters, so a JWT's dots and padding survive", () => {
    const url = buildEndSessionUrl({
      baseUrl: BASE,
      postLogoutUri: "https://example.org/landing?a=b&c=d",
      idToken: "a.b+c/d=",
    });
    const { params } = parse(url);
    expect(params.get("post_logout_redirect_uri")).toBe("https://example.org/landing?a=b&c=d");
    expect(params.get("id_token_hint")).toBe("a.b+c/d=");
    // The app's own query string must not leak out as top-level parameters.
    expect(params.has("a")).toBe(false);
  });

  describe("client_id", () => {
    // OIDC RP-Initiated Logout: without id_token_hint, client_id is what tells
    // MP whose registered post-logout URIs to check. Sent in both cases.
    it("is sent alongside id_token_hint", () => {
      const { params } = parse(
        buildEndSessionUrl({ baseUrl: BASE, postLogoutUri: APP, idToken: "a.b.c", clientId: "TM.Widgets" })
      );
      expect(params.get("client_id")).toBe("TM.Widgets");
      expect(params.get("id_token_hint")).toBe("a.b.c");
      expect(params.get("post_logout_redirect_uri")).toBe(APP);
    });

    it("is sent when there is no id_token_hint", () => {
      const { params } = parse(buildEndSessionUrl({ baseUrl: BASE, postLogoutUri: APP, clientId: "TM.Widgets" }));
      expect(params.get("client_id")).toBe("TM.Widgets");
      expect(params.has("id_token_hint")).toBe(false);
      expect(params.get("post_logout_redirect_uri")).toBe(APP);
    });

    it.each([[undefined], [null], [""]])("is omitted, not sent empty, when the client id is %p", (clientId) => {
      const { params } = parse(buildEndSessionUrl({ baseUrl: BASE, postLogoutUri: APP, clientId }));
      expect(params.has("client_id")).toBe(false);
    });
  });

  it("tolerates a trailing slash on the base URL", () => {
    expect(parse(buildEndSessionUrl({ baseUrl: BASE + "/", postLogoutUri: APP })).path).toBe(
      "https://moody.ministryplatform.com/ministryplatformapi/oauth/connect/endsession"
    );
  });

  it("pins the provider id the account lookup filters on", () => {
    // If this drifts from `providerId` in src/lib/auth.ts, the account lookup
    // silently finds nothing and the hint is silently never sent.
    expect(MP_PROVIDER_ID).toBe(mpConfig().providerId);
  });
});
