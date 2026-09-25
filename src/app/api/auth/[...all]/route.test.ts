import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetTableRecords } = vi.hoisted(() => ({
  mockGetTableRecords: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/providers/ministry-platform", () => ({
  MPHelper: class {
    getTableRecords = mockGetTableRecords;
  },
}));

// With explicit endpoints the auth module makes NO network call at import or
// at sign-in start. Make any fetch fail loudly: a discovery fetch here is the
// boot-time outage mode the config exists to avoid.
//
// It MUST be installed in vi.hoisted. Static imports run before the module
// body, and better-auth 1.7 fetches discovery eagerly while "./route" is being
// imported, so a spy installed in the body would miss that fetch entirely and
// the "no discovery" assertion below would pass with discoveryUrl re-added.
const { fetchSpy } = vi.hoisted(() => {
  const fetchSpy = vi.fn(() => Promise.reject(new Error("unexpected fetch from the auth module")));
  vi.stubGlobal("fetch", fetchSpy);
  return { fetchSpy };
});

import { GET, POST, allowedAuthRoutes, allowedSignInSocialKeys } from "./route";
import { MP_PROVIDER_ID } from "@/lib/auth-endsession";

const ORIGIN = "http://localhost:3000"; // BETTER_AUTH_URL in src/test-setup.ts
const req = (path: string, method: "GET" | "POST", body?: unknown) =>
  new NextRequest(`${ORIGIN}/api/auth${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json", origin: ORIGIN },
          body: typeof body === "string" ? body : JSON.stringify(body),
        }),
  });
const refusedByUs = async (res: Response) =>
  res.status === 404 && (await res.text()) === "Not Found";

it("pins the exact allowlist", () => {
  expect(allowedAuthRoutes).toEqual({
    GET: ["/get-session", "/callback/ministryplatform"],
    POST: ["/sign-in/social"],
  });
  expect(allowedSignInSocialKeys).toEqual(["provider", "callbackURL"]);
});

it("names the callback after OUR provider id, not upstream's", () => {
  expect(allowedAuthRoutes.GET).toContain(`/callback/${MP_PROVIDER_ID}`);
  expect(allowedAuthRoutes.GET).not.toContain("/callback/ministry-platform");
});

it("POST /sign-in/social returns an authorize URL whose redirect_uri is the allowlisted callback", async () => {
  const res = await POST(req("/sign-in/social", "POST", { provider: MP_PROVIDER_ID, callbackURL: "/" }));
  expect(res.status).toBe(200);
  const { url } = await res.json();
  const au = new URL(url);
  expect(au.origin + au.pathname).toBe("https://test-mp.example.com/oauth/connect/authorize");
  const redirect = new URL(au.searchParams.get("redirect_uri")!);
  expect(redirect.toString()).toBe(`${ORIGIN}/api/auth/callback/ministryplatform`);
  expect(allowedAuthRoutes.GET).toContain(redirect.pathname.replace(/^\/api\/auth/, ""));
  expect(au.searchParams.get("scope")).toBe("openid http://www.thinkministry.com/dataplatform/scopes/all");
  expect(au.searchParams.has("nonce")).toBe(false);
  expect(au.searchParams.has("code_challenge")).toBe(false); // pkce:false still honoured
  expect(fetchSpy).not.toHaveBeenCalled();                    // no discovery, no JWKS
});

it("GET /callback/ministryplatform reaches better-auth (state error, not our 404)", async () => {
  const res = await GET(req("/callback/ministryplatform", "GET"));
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toMatch(/^\/auth-error\?error=state_not_found/);
});

it.each([
  ["idToken", { provider: "ministryplatform", callbackURL: "/", idToken: { token: "a.b.c", accessToken: "x" } }],
  ["scopes", { provider: "ministryplatform", callbackURL: "/", scopes: ["offline_access"] }],
  ["additionalParams", { provider: "ministryplatform", callbackURL: "/", additionalParams: { prompt: "none" } }],
  ["loginHint", { provider: "ministryplatform", callbackURL: "/", loginHint: "x" }],
  ["requestSignUp", { provider: "ministryplatform", callbackURL: "/", requestSignUp: true }],
  ["errorCallbackURL", { provider: "ministryplatform", callbackURL: "/", errorCallbackURL: "/x" }],
  ["newUserCallbackURL", { provider: "ministryplatform", callbackURL: "/", newUserCallbackURL: "/x" }],
  ["additionalData", { provider: "ministryplatform", callbackURL: "/", additionalData: {} }],
  ["upstream provider id", { provider: "ministry-platform", callbackURL: "/" }],
  ["no provider", { callbackURL: "/" }],
  ["array body", [{ provider: "ministryplatform" }]],
  ["non-JSON body", "provider=ministryplatform"],
])("refuses POST /sign-in/social with %s", async (_label, body) => {
  expect(await refusedByUs(await POST(req("/sign-in/social", "POST", body)))).toBe(true);
});

// better-call matches Content-Type by substring and would parse a multi-valued
// header as FORM data, reading different keys than the JSON the filter checked.
// So the filter refuses anything but exactly application/json — even when the
// body itself is otherwise allowed.
const socialPost = (contentType: string | null) =>
  new NextRequest(`${ORIGIN}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { origin: ORIGIN, ...(contentType === null ? {} : { "content-type": contentType }) },
    body: JSON.stringify({ provider: MP_PROVIDER_ID, callbackURL: "/" }),
  });

it.each([
  ["a multi-valued content type", "text/html, application/json, application/x-www-form-urlencoded"],
  ["form data listed before JSON", "application/x-www-form-urlencoded, application/json"],
  ["text/plain", "text/plain"],
  ["application/json as a substring", "application/jsonx"],
  ["no content type", null],
])("refuses POST /sign-in/social sent with %s", async (_label, contentType) => {
  expect(await refusedByUs(await POST(socialPost(contentType)))).toBe(true);
});

it("accepts application/json with a charset parameter", async () => {
  expect((await POST(socialPost("application/json; charset=utf-8"))).status).toBe(200);
});

/**
 * F7 — deny-by-default on the better-auth catch-all.
 *
 * better-auth 1.7.5 mounts 30 endpoints here; the browser uses three. These
 * tests drive the REAL exported handlers with real NextRequest objects, so
 * they fail if the allowlist is widened, bypassed, or removed.
 */
describe("better-auth route allowlist", () => {
  const req = (path: string, method: "GET" | "POST") =>
    new NextRequest(`http://localhost:3000/api/auth${path}`, { method });

  it.each(allowedAuthRoutes.GET)("lets GET %s reach better-auth", async (path) => {
    expect((await GET(req(path, "GET"))).status).not.toBe(404);
  });

  // The endpoints the advisory and the F7 review actually care about.
  it.each([
    "/update-user",
    "/list-accounts",
    "/link-social",
    "/unlink-account",
    "/get-access-token",
    "/refresh-token",
    "/list-sessions",
    "/revoke-sessions",
    "/sign-up/email",
    "/sign-in/email",
    "/update-session",
    "/sign-out",
    "/error",
    "/ok",
    "/sign-in/oauth2",
    "/oauth2/link",
    "/callback/ministryplatform",
  ])("404s POST %s without touching better-auth", async (path) => {
    expect((await POST(req(path, "POST"))).status).toBe(404);
  });

  it.each([
    "/list-accounts",
    "/ok",
    "/error",
    "/get-access-token",
    "/oauth2/callback/ministryplatform",
    "/callback/ministry-platform",
    "/sign-in/social",
  ])(
    "404s GET %s",
    async (path) => {
      expect((await GET(req(path, "GET"))).status).toBe(404);
    }
  );

  it("does not let an allowed GET path through on POST", async () => {
    expect((await POST(req("/get-session", "POST"))).status).toBe(404);
  });

  it("does not let an allowed POST path through on GET", async () => {
    expect((await GET(req("/sign-in/social", "GET"))).status).toBe(404);
  });

  describe("path normalization cannot be used to bypass the exact match", () => {
    // Our 404 carries this body; better-auth's own 404 body is empty. That is
    // what lets these tests prove the request was refused HERE and never
    // reached better-auth, rather than merely observing a 404 status.
    const refusedByUs = async (res: Response) =>
      res.status === 404 && (await res.text()) === "Not Found";

    it.each(["/list-accounts/", "/list-accounts///", "/update-user/"])(
      "refuses %s — a trailing slash is not a bypass",
      async (path) => {
        expect(await refusedByUs(await GET(req(path, "GET")))).toBe(true);
      }
    );

    it.each(["/get-sessionX", "/get-session/extra", "/sign-in/socialX", "/callback/ministryplatformX"])(
      "refuses %s — a prefix is not a match",
      async (path) => {
        expect(await refusedByUs(await GET(req(path, "GET")))).toBe(true);
      }
    );

    it("resolves traversal before matching, so it cannot reach a disallowed path", async () => {
      // NextRequest/URL normalize this to /api/auth/list-accounts before our
      // handler sees it, so it is refused as the real path it resolves to.
      expect(await refusedByUs(await GET(req("/get-session/../list-accounts", "GET")))).toBe(
        true
      );
    });

    it("documents that better-auth itself 404s a trailing slash on an allowed path", async () => {
      // /get-session/ normalizes past OUR allowlist (so it is not refused by
      // us) but better-auth then 404s it on its own. Recorded so a future
      // reader does not mistake this for the allowlist misfiring. Either way
      // the outcome fails closed.
      const res = await GET(req("/get-session/", "GET"));
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("");
    });
  });
});
