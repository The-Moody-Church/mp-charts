// @vitest-environment node
//
// Node, not jsdom: under jsdom, jose rejects the key it signs the JWT cookie
// cache with (a cross-realm Uint8Array) and the callback 500s.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { betterAuth } from "better-auth";

/**
 * Behavioural pins for better-auth's own checks on the code flow, through the
 * REAL exported route handlers and the REAL auth config against a fake
 * Ministry Platform (upstream MPNext 6167cfd, adapted).
 *
 * CLAUDE.md depends on three things that other tests pin only as config:
 * `advanced.disableOriginCheck: false`, the OAuth state handling, and the
 * session cookie attributes. A better-auth minor that changed the behaviour
 * behind any of them would pass a config assertion and fail here.
 *
 * Adapted from upstream: our providerId `ministryplatform` (no hyphen),
 * explicit endpoints with no discovery, `pkce: false`, and no id_token
 * signature verification (audit N17), so upstream's JWKS/iss/aud cases and its
 * user-id cache are left out. Every refusal below uses a body our route's
 * filter accepts, so the 403 or redirect is better-auth's, not our 404.
 */

const ORIGIN = "http://localhost:3000"; // BETTER_AUTH_URL in src/test-setup.ts
const MP = "https://test-mp.example.com/oauth";
const T0 = new Date("2026-11-18T14:00:00Z").getTime();
const MINUTE = 60_000;

const { mp } = vi.hoisted(() => {
  const mp = { calls: [] as string[] };
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      mp.calls.push(url);
      if (url === "https://test-mp.example.com/oauth/connect/token") {
        const idToken = `h.${Buffer.from(JSON.stringify({ sub: "ab12cd34-ef56-7890-abcd-ef1234567890" })).toString("base64url")}.s`;
        return json({ access_token: "at", token_type: "Bearer", expires_in: 3600, id_token: idToken });
      }
      if (url === "https://test-mp.example.com/oauth/connect/userinfo") {
        if (new Headers(init?.headers).get("authorization") !== "Bearer at") return new Response("", { status: 401 });
        return json({ sub: "ab12cd34-ef56-7890-abcd-ef1234567890", email: "jon@example.org", given_name: "Jon" });
      }
      throw new Error(`Blocked unexpected fetch in test: ${url}`);
    })
  );
  return { mp };
});

vi.mock("@/lib/providers/ministry-platform", () => ({
  MPHelper: class {
    getTableRecords = vi.fn().mockResolvedValue([{ User_ID: 42, Contact_ID: 99 }]);
  },
}));

import { GET, POST } from "./route";
import { auth } from "@/lib/auth";
import { MP_PROVIDER_ID } from "@/lib/auth-endsession";

type Handler = (request: Request) => Promise<Response>;
const routeHandler: Handler = (request) =>
  (request.method === "GET" ? GET : POST)(new NextRequest(request));

const tokenCalls = () => mp.calls.filter((u) => u === `${MP}/connect/token`);
const cookieHeader = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

function signIn(
  handle: Handler,
  callbackURL: string,
  { origin = ORIGIN, headers = {} }: { origin?: string; headers?: Record<string, string> } = {}
) {
  return handle(
    new Request(`${origin}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, ...headers },
      body: JSON.stringify({ provider: MP_PROVIDER_ID, callbackURL }),
    })
  );
}

async function startSignIn(handle: Handler = routeHandler, origin = ORIGIN) {
  const res = await signIn(handle, "/dash", { origin });
  expect(res.status).toBe(200);
  const authorize = new URL((await res.json()).url);
  return { res, state: authorize.searchParams.get("state")!, cookie: cookieHeader(res) };
}

function callback(query: string, cookie: string, handle: Handler = routeHandler, origin = ORIGIN) {
  return handle(
    new Request(`${origin}/api/auth/callback/${MP_PROVIDER_ID}?${query}`, {
      headers: cookie ? { cookie } : {},
    })
  );
}

/** A completed sign-in: the callback response, whose cookies are the session. */
async function signedIn(handle: Handler = routeHandler, origin = ORIGIN) {
  const { state, cookie } = await startSignIn(handle, origin);
  const back = await callback(`code=abc&state=${state}`, cookie, handle, origin);
  expect(back.status).toBe(302);
  expect(back.headers.get("location")).toBe("/dash");
  return back;
}

/** A refused callback: our error page with `code`, no session, and the code never redeemed. */
function expectRefused(res: Response, code: string) {
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get("location") ?? "", ORIGIN);
  expect(location.pathname).toBe("/auth-error");
  expect(location.searchParams.get("error")).toBe(code);
  expect(res.headers.getSetCookie().some((c) => /session_token=[^;]/.test(c))).toBe(false);
  expect(tokenCalls()).toEqual([]);
}

/** Parses one Set-Cookie line into its name and lower-cased attribute map. */
function parseSetCookie(line: string) {
  const [pair, ...attrs] = line.split(";").map((p) => p.trim());
  const name = pair.slice(0, pair.indexOf("="));
  const attributes = new Map(
    attrs.map((a) => {
      const i = a.indexOf("=");
      return i === -1 ? [a.toLowerCase(), ""] : [a.slice(0, i).toLowerCase(), a.slice(i + 1)];
    })
  );
  return { name, attributes };
}

beforeEach(() => {
  mp.calls.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("better-auth's origin check is live on the real route", () => {
  it("resolves skipOriginCheck to false although Vitest sets NODE_ENV=test", async () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect((await auth.$context).skipOriginCheck).toBe(false);
  });

  it.each([
    ["an absolute URL on another origin", "https://evil.example"],
    ["an absolute URL with a path", "https://evil.example/phish"],
    ["a protocol-relative URL", "//evil.example"],
    ["a backslash path", "/\\evil.example"],
    ["a tab-smuggled protocol-relative path", "/\t/evil"],
  ])("refuses a callbackURL that is %s with 403 INVALID_CALLBACK_URL", async (_label, url) => {
    const res = await signIn(routeHandler, url);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "INVALID_CALLBACK_URL" });
    // Refused before a state cookie or authorize URL existed.
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["a relative path", "/contacts"],
    ["an absolute URL on our origin", `${ORIGIN}/contacts`],
  ])("control: accepts %s", async (_label, url) => {
    expect((await signIn(routeHandler, url)).status).toBe(200);
  });

  it("refuses a cookie-bearing POST from another site with 403 INVALID_ORIGIN", async () => {
    const session = cookieHeader(await signedIn());

    const res = await signIn(routeHandler, "/", {
      headers: { origin: "https://evil.example", cookie: session },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "INVALID_ORIGIN" });
  });

  it("control: the same cookie-bearing POST from our own origin is accepted", async () => {
    const session = cookieHeader(await signedIn());
    expect((await signIn(routeHandler, "/", { headers: { cookie: session } })).status).toBe(200);
  });
});

describe("negative controls: the same requests pass once the check is weakened", () => {
  // Built from the real options with one change each, and driven through the
  // instance's own handler (our route is bound to the real instance).
  const weakened = (overrides: Parameters<typeof betterAuth>[0]) => betterAuth({ ...auth.options, ...overrides });

  it("disableOriginCheck: true accepts https://evil.example and a cross-site cookie-bearing POST", async () => {
    const weak = weakened({ advanced: { ...auth.options.advanced, disableOriginCheck: true } });
    expect((await signIn(weak.handler, "https://evil.example")).status).toBe(200);
    const session = cookieHeader(await signedIn(weak.handler));
    const res = await signIn(weak.handler, "/", { headers: { origin: "https://evil.example", cookie: session } });
    expect(res.status).toBe(200);
  });

  it('trustedOrigins: ["*"] accepts https://evil.example', async () => {
    const weak = weakened({ trustedOrigins: ["*"] });
    expect((await signIn(weak.handler, "https://evil.example")).status).toBe(200);
  });
});

describe("callback state: refused before the code is ever redeemed", () => {
  it("no state at all (state_not_found)", async () => {
    const { cookie } = await startSignIn();
    expectRefused(await callback("code=abc", cookie), "state_not_found");
  });

  it("a state that does not match its cookie (state_mismatch)", async () => {
    const { cookie } = await startSignIn();
    expectRefused(await callback(`code=abc&state=${"x".repeat(32)}`, cookie), "state_mismatch");
  });

  it("a valid state presented without its oauth_state cookie (another browser's callback)", async () => {
    const { state } = await startSignIn();
    expectRefused(await callback(`code=abc&state=${state}`, ""), "state_mismatch");
  });

  it("a tampered oauth_state cookie (state_invalid)", async () => {
    const { state, cookie } = await startSignIn();
    const tampered = cookie.replace(/(oauth_state=[^;]*)....(;|$)/, "$1AAAA$2");
    expect(tampered).not.toBe(cookie);
    expectRefused(await callback(`code=abc&state=${state}`, tampered), "state_invalid");
  });

  it("a state older than 10 minutes, even with its cookie", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    const { state, cookie } = await startSignIn();
    vi.setSystemTime(T0 + 10 * MINUTE + 1000);
    expectRefused(await callback(`code=abc&state=${state}`, cookie), "state_mismatch");
  });

  it("control: the same state is accepted at 9 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    const { state, cookie } = await startSignIn();
    vi.setSystemTime(T0 + 9 * MINUTE);
    const res = await callback(`code=abc&state=${state}`, cookie);
    expect(res.headers.get("location")).toBe("/dash");
    expect(tokenCalls()).toHaveLength(1);
  });
});

describe("cookie attributes", () => {
  it("oauth_state: HttpOnly, SameSite=Lax, Path=/, ten minutes, not Secure over http://localhost", async () => {
    const { res } = await startSignIn();
    const state = res.headers.getSetCookie().map(parseSetCookie).find((c) => c.name === "better-auth.oauth_state");
    expect(state).toBeDefined();
    expect(state!.attributes.has("httponly")).toBe(true);
    expect(state!.attributes.get("samesite")?.toLowerCase()).toBe("lax");
    expect(state!.attributes.get("path")).toBe("/");
    expect(state!.attributes.get("max-age")).toBe("600");
    expect(state!.attributes.has("secure")).toBe(false);
  });

  it("session_token and session_data: HttpOnly, SameSite=Lax, Path=/, no prefix and not Secure over http://localhost", async () => {
    const back = await signedIn();
    const cookies = back.headers.getSetCookie().map(parseSetCookie);
    for (const name of ["better-auth.session_token", "better-auth.session_data"]) {
      const cookie = cookies.find((c) => c.name === name);
      expect(cookie, name).toBeDefined();
      expect(cookie!.attributes.has("httponly")).toBe(true);
      expect(cookie!.attributes.get("samesite")?.toLowerCase()).toBe("lax");
      expect(cookie!.attributes.get("path")).toBe("/");
      expect(cookie!.attributes.has("secure")).toBe(false);
    }
    expect(cookies.some((c) => c.name.startsWith("__Secure-"))).toBe(false);
  });

  describe("with an https BETTER_AUTH_URL", () => {
    const HTTPS_ORIGIN = "https://app.example.org";
    let saved: string | undefined;
    let secureRoute: Handler;

    beforeEach(async () => {
      saved = process.env.BETTER_AUTH_URL;
      process.env.BETTER_AUTH_URL = HTTPS_ORIGIN;
      vi.resetModules();
      const route = await import("./route");
      secureRoute = (request) => (request.method === "GET" ? route.GET : route.POST)(new NextRequest(request));
    });

    afterEach(() => {
      process.env.BETTER_AUTH_URL = saved;
      vi.resetModules();
    });

    it("every auth cookie is __Secure- prefixed, Secure, HttpOnly, SameSite=Lax and Path=/", async () => {
      const { res: start, state, cookie } = await startSignIn(secureRoute, HTTPS_ORIGIN);
      const back = await callback(`code=abc&state=${state}`, cookie, secureRoute, HTTPS_ORIGIN);
      expect(back.headers.get("location")).toBe("/dash");

      const cookies = [...start.headers.getSetCookie(), ...back.headers.getSetCookie()]
        .map(parseSetCookie)
        .filter((c) => /oauth_state|session_token|session_data/.test(c.name) && c.attributes.get("max-age") !== "0");
      expect(cookies.map((c) => c.name).sort()).toEqual([
        "__Secure-better-auth.oauth_state",
        "__Secure-better-auth.session_data",
        "__Secure-better-auth.session_token",
      ]);
      for (const c of cookies) {
        expect(c.attributes.has("secure"), c.name).toBe(true);
        expect(c.attributes.has("httponly"), c.name).toBe(true);
        expect(c.attributes.get("samesite")?.toLowerCase(), c.name).toBe("lax");
        expect(c.attributes.get("path"), c.name).toBe("/");
      }
    });
  });
});
