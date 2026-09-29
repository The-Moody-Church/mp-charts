import { describe, it, expect, vi, afterEach } from "vitest";
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
import { auth } from "@/lib/auth";

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

// Each of these carries a body that is otherwise allowed; proving the handler
// is never reached shows the refusal is ours, not better-auth's.
describe("Content-Type values that must never reach better-auth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses JSON with a charset followed by form data", async () => {
    const handler = vi.spyOn(auth, "handler");
    const res = await POST(socialPost("application/json; charset=utf-8, application/x-www-form-urlencoded"));
    expect(await refusedByUs(res)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses a Content-Type header sent twice", async () => {
    const handler = vi.spyOn(auth, "handler");
    const headers = new Headers({ origin: ORIGIN });
    headers.append("content-type", "application/json");
    headers.append("content-type", "application/json");
    // A repeated header reaches the route comma-joined.
    expect(headers.get("content-type")).toBe("application/json, application/json");
    const res = await POST(
      new NextRequest(`${ORIGIN}/api/auth/sign-in/social`, {
        method: "POST",
        headers,
        body: JSON.stringify({ provider: MP_PROVIDER_ID, callbackURL: "/" }),
      })
    );
    expect(await refusedByUs(res)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });
});

it("accepts application/json with a charset parameter", async () => {
  expect((await POST(socialPost("application/json; charset=utf-8"))).status).toBe(200);
});

/**
 * Size DoS (upstream MPNext 48a871b): a relative callbackURL of any length
 * passes better-auth's isSafeRelativeURL and comes back as a Set-Cookie ~2x
 * its size, and this filter runs before better-auth's rate limiter. The filter
 * caps the declared Content-Length, the bytes actually read (4096), and
 * callbackURL itself (2048). Each refusal is checked by `auth.handler` never
 * being called.
 */
describe("POST /sign-in/social size and type limits", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const legit = { provider: MP_PROVIDER_ID, callbackURL: "/contacts" };
  const postSignIn = (body: string, contentType = "application/json", extra: Record<string, string> = {}) =>
    POST(
      new NextRequest(`${ORIGIN}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": contentType, origin: ORIGIN, ...extra },
        body,
      })
    );
  const postStream = (stream: ReadableStream<Uint8Array>) =>
    POST(
      new NextRequest(`${ORIGIN}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: stream,
        // Required by undici for a streamed request body.
        duplex: "half",
      } as ConstructorParameters<typeof NextRequest>[1])
    );
  /** A stream yielding `chunks` chunks of `chunkSize` bytes after `prefix`, counting pulls. */
  function chunkedStream(chunkSize: number, chunks: number, prefix = "") {
    const encoder = new TextEncoder();
    let sent = 0;
    const state = { pulled: 0 };
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        state.pulled += 1;
        if (sent === 0 && prefix) controller.enqueue(encoder.encode(prefix));
        if (sent >= chunks) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(chunkSize).fill(0x61));
        sent += 1;
      },
    });
    return { stream, state };
  }
  const echoHandler = () =>
    vi.spyOn(auth, "handler").mockImplementation(async (r: Request) => Response.json(await r.json()));

  it("404s a request with no body at all", async () => {
    const handler = vi.spyOn(auth, "handler");
    const res = await POST(
      new NextRequest(`${ORIGIN}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
      })
    );
    expect(await refusedByUs(res)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it("404s a 5 MB callbackURL without reaching better-auth", async () => {
    const handler = vi.spyOn(auth, "handler");
    const res = await postSignIn(JSON.stringify({ provider: MP_PROVIDER_ID, callbackURL: "/" + "a".repeat(5 * 1024 * 1024) }));
    expect(await refusedByUs(res)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it("404s a declared Content-Length of 1000000 before cloning or reading the body", async () => {
    const handler = vi.spyOn(auth, "handler");
    const clone = vi.spyOn(NextRequest.prototype, "clone");
    const res = await postSignIn(JSON.stringify(legit), "application/json", { "content-length": "1000000" });
    expect(await refusedByUs(res)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
  });

  it.each(["abc", "-1", "1e3", "100, 100", ""])("404s a malformed Content-Length %j", async (contentLength) => {
    const handler = vi.spyOn(auth, "handler");
    const res = await postSignIn(JSON.stringify(legit), "application/json", { "content-length": contentLength });
    expect(await refusedByUs(res)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it("accepts a declared Content-Length within the cap", async () => {
    const handler = vi.spyOn(auth, "handler").mockResolvedValue(new Response(null, { status: 204 }));
    const body = JSON.stringify(legit);
    const res = await postSignIn(body, "application/json", {
      "content-length": String(new TextEncoder().encode(body).byteLength),
    });
    expect(res.status).toBe(204);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("refuses an oversized chunked body with no Content-Length, without draining it", async () => {
    const handler = vi.spyOn(auth, "handler");
    // 1,000 x 1 KiB chunks = ~1 MB if fully drained.
    const { stream, state } = chunkedStream(1024, 1000, `{"provider":"${MP_PROVIDER_ID}","callbackURL":"/`);
    const res = await postStream(stream);
    expect(await refusedByUs(res)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    // Stopped a few chunks past the 4 KiB cap, not after 1,000.
    expect(state.pulled).toBeLessThan(20);
  });

  it("accepts a small legitimate body sent as a multi-chunk stream, and better-auth reads it intact", async () => {
    const handler = echoHandler();
    const encoder = new TextEncoder();
    const parts = [`{"provider":"${MP_PROVIDER_ID.slice(0, 4)}`, `${MP_PROVIDER_ID.slice(4)}","callbackURL":"/contacts"}`];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) controller.enqueue(encoder.encode(part));
        controller.close();
      },
    });
    const res = await postStream(stream);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(legit);
  });

  it("accepts a callbackURL of exactly 2048 characters", async () => {
    const handler = vi.spyOn(auth, "handler").mockResolvedValue(new Response(null, { status: 204 }));
    const res = await postSignIn(JSON.stringify({ provider: MP_PROVIDER_ID, callbackURL: "/" + "a".repeat(2047) }));
    expect(res.status).toBe(204);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("404s a callbackURL of 2049 characters", async () => {
    const handler = vi.spyOn(auth, "handler");
    const res = await postSignIn(JSON.stringify({ provider: MP_PROVIDER_ID, callbackURL: "/" + "a".repeat(2048) }));
    expect(await refusedByUs(res)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ["a number", 42],
    ["null", null],
    ["an array", ["/contacts"]],
    ["an object", { href: "/contacts" }],
    ["a boolean", true],
  ])("404s a callbackURL that is %s", async (_label, callbackURL) => {
    const handler = vi.spyOn(auth, "handler");
    const res = await postSignIn(JSON.stringify({ provider: MP_PROVIDER_ID, callbackURL }));
    expect(await refusedByUs(res)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  // The filter decodes the bytes itself now, so pin that it still parses the
  // way better-call's request.json() does.
  it.each([
    ["a leading UTF-8 BOM", "\uFEFF" + JSON.stringify(legit)],
    ["duplicate keys (last wins, as in JSON.parse)", `{"provider":"google","provider":"${MP_PROVIDER_ID}","callbackURL":"/contacts"}`],
  ])("parses %s the same way better-auth does", async (_label, body) => {
    const handler = echoHandler();
    const res = await postSignIn(body, "application/json; charset=iso-8859-1");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual(legit);
  });

  it("404s duplicate keys whose LAST provider is not ours", async () => {
    const handler = vi.spyOn(auth, "handler");
    const res = await postSignIn(`{"provider":"${MP_PROVIDER_ID}","provider":"google"}`);
    expect(await refusedByUs(res)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it("404s trailing garbage after the JSON object", async () => {
    const handler = vi.spyOn(auth, "handler");
    const res = await postSignIn(JSON.stringify(legit) + "x");
    expect(await refusedByUs(res)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });
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
