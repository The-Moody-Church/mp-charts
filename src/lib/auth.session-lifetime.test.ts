// @vitest-environment node
//
// Node, not jsdom: under jsdom, jose rejects the key it signs the JWT cookie
// cache with (a cross-realm Uint8Array) and the callback 500s.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { betterAuth } from "better-auth";

/**
 * Clock-walk guard for the session lifetime settings in src/lib/auth.ts
 * (upstream MPNext fd7fc4a, ported to our explicit-endpoint provider).
 *
 * Signs in through the REAL `auth` instance against a fake MP (token +
 * userinfo; MPHelper mocked), steps a fake clock and replays the cookies to
 * GET /get-session as a browser, or an attacker holding a copied pair, would.
 *
 * - Hard ceiling: nothing is valid after sign-in + 12h, on the cookie-cache
 *   path or the in-memory path, however often it is used.
 * - A pair not backed by a live row (copied before sign-out) dies within 1h
 *   of when its session_data was minted.
 * The negative control is our pre-fix session block (1h JWT cookie cache and
 * nothing else): the same walk survives ~7 days.
 */

vi.hoisted(() => {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  const idToken = `h.${Buffer.from(JSON.stringify({ sub: "ab12cd34-ef56-7890-abcd-ef1234567890" })).toString("base64url")}.s`;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "https://test-mp.example.com/oauth/connect/token" && init?.method === "POST") {
      return json({ access_token: "at", token_type: "Bearer", expires_in: 3600, id_token: idToken });
    }
    if (url === "https://test-mp.example.com/oauth/connect/userinfo") {
      return json({ sub: "ab12cd34-ef56-7890-abcd-ef1234567890", given_name: "Clock", family_name: "Walker" });
    }
    throw new Error(`Blocked unexpected fetch in test: ${url}`);
  }) as typeof fetch;
});

vi.mock("@/lib/providers/ministry-platform", () => ({
  MPHelper: class {
    getTableRecords = vi.fn().mockResolvedValue([{ User_ID: 42, Contact_ID: 99 }]);
  },
}));

import { auth, SESSION_EXPIRES_IN_SECONDS, SESSION_COOKIE_CACHE_MAX_AGE_SECONDS } from "@/lib/auth";

type AuthLike = { handler: (r: Request) => Promise<Response> };

const SUB = "ab12cd34-ef56-7890-abcd-ef1234567890";
const ORIGIN = "http://localhost:3000";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T0 = new Date("2026-09-28T08:00:00Z").getTime();

class CookieJar {
  private cookies = new Map<string, string>();
  constructor(from?: CookieJar) {
    if (from) this.cookies = new Map(from.cookies);
  }
  apply(response: Response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const maxAge = attrs.map((a) => a.trim()).find((a) => /^max-age=/i.test(a));
      if (value === "" || (maxAge && Number(maxAge.split("=")[1]) <= 0)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  without(pattern: RegExp) {
    const copy = new CookieJar(this);
    for (const name of [...copy.cookies.keys()]) if (pattern.test(name)) copy.cookies.delete(name);
    return copy;
  }
}

async function signIn(instance: AuthLike) {
  const jar = new CookieJar();
  const start = await instance.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ provider: "ministryplatform", callbackURL: "/" }),
    }),
  );
  expect(start.status).toBe(200);
  jar.apply(start);
  const state = new URL(((await start.json()) as { url: string }).url).searchParams.get("state")!;
  const back = await instance.handler(
    new Request(`${ORIGIN}/api/auth/callback/ministryplatform?code=abc&state=${encodeURIComponent(state)}`, {
      headers: { cookie: jar.header() },
    }),
  );
  expect(back.status).toBe(302);
  expect(back.headers.get("location")).toBe("/");
  jar.apply(back);
  return jar;
}

async function getSession(instance: AuthLike, jar: CookieJar) {
  const res = await instance.handler(new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie: jar.header() } }));
  expect(res.status).toBe(200);
  jar.apply(res);
  const body = (await res.json()) as { user?: { userGuid?: string } } | null;
  return body?.user?.userGuid ?? null;
}

async function walk(instance: AuthLike, jar: CookieJar, step: number, limit: number) {
  let lastValid = 0;
  for (let t = step; t <= limit; t += step) {
    vi.setSystemTime(T0 + t);
    const guid = await getSession(instance, jar);
    if (guid === null) return { lastValid, firstInvalid: t };
    expect(guid).toBe(SUB);
    lastValid = t;
  }
  return { lastValid, firstInvalid: null };
}

async function signOut(instance: AuthLike, jar: CookieJar) {
  const res = await instance.handler(
    new Request(`${ORIGIN}/api/auth/sign-out`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, cookie: jar.header() },
      body: "{}",
    }),
  );
  expect(res.status).toBe(200);
  jar.apply(res);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("session lifetime settings", () => {
  it("pins 12h absolute, no sliding, no cookie-only re-mint", async () => {
    expect(SESSION_EXPIRES_IN_SECONDS).toBe(12 * 60 * 60);
    expect(SESSION_COOKIE_CACHE_MAX_AGE_SECONDS).toBe(60 * 60);
    expect(auth.options.session).toMatchObject({
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      disableSessionRefresh: true,
      cookieCache: { enabled: true, maxAge: SESSION_COOKIE_CACHE_MAX_AGE_SECONDS, strategy: "jwt", refreshCache: false },
    });
    const context = await auth.$context;
    // With no database better-auth defu-merges refreshCache: true UNDER our config.
    expect(context.sessionConfig.cookieRefreshCache).toBe(false);
    expect(context.sessionConfig.expiresIn).toBe(SESSION_EXPIRES_IN_SECONDS);
  });
});

describe("clock walk through the real auth instance", () => {
  it("an actively used session never survives sign-in + 12h", async () => {
    const jar = await signIn(auth);
    const r = await walk(auth, jar, 10 * MINUTE, 3 * DAY);
    expect(r.lastValid).toBe(12 * HOUR);
    expect(r.firstInvalid).toBe(12 * HOUR + 10 * MINUTE);
  });

  it("the in-memory path alone (no session_data) does not slide expiresAt", async () => {
    const jar = (await signIn(auth)).without(/session_data/);
    const r = await walk(auth, jar, 30 * MINUTE, 3 * DAY);
    expect(r.lastValid).toBe(12 * HOUR);
    expect(r.firstInvalid).toBe(12 * HOUR + 30 * MINUTE);
  });

  it("a cookie pair copied before sign-out dies within 1h of being minted", async () => {
    const victim = await signIn(auth);
    const copied = new CookieJar(victim);
    vi.setSystemTime(T0 + 5 * MINUTE);
    await signOut(auth, victim);
    expect(await getSession(auth, victim)).toBeNull();
    const r = await walk(auth, copied, 5 * MINUTE, 3 * DAY);
    expect(r.firstInvalid).not.toBeNull();
    expect(r.firstInvalid!).toBeLessThanOrEqual(SESSION_COOKIE_CACHE_MAX_AGE_SECONDS * 1000 + 5 * MINUTE);
  });
});

describe("negative control: our pre-fix session block", () => {
  const preFix = betterAuth({
    ...auth.options,
    session: { cookieCache: { enabled: true, maxAge: 60 * 60, strategy: "jwt" } },
  });

  it("a copied pair survives sign-out and re-mints itself until ~7 days", async () => {
    const victim = await signIn(preFix);
    const copied = new CookieJar(victim);
    vi.setSystemTime(T0 + 5 * MINUTE);
    await signOut(preFix, victim);
    const r = await walk(preFix, copied, 50 * MINUTE, 8 * DAY);
    expect(r.lastValid).toBe(201 * 50 * MINUTE); // 6.98 days
    expect(r.firstInvalid).toBe(202 * 50 * MINUTE); // 7.01 days
  });

  it("a copied session_token alone slides past 7 days on a long-running process", async () => {
    const victim = await signIn(preFix);
    const tokenOnly = new CookieJar(victim).without(/session_data/);
    vi.setSystemTime(T0 + 5 * MINUTE);
    // Sign-out in ANOTHER instance (the pre-fix server-action layer) leaves this row alone.
    await signOut(betterAuth({ ...preFix.options }), victim);
    const r = await walk(preFix, tokenOnly, 1 * DAY + 1 * HOUR, 30 * DAY);
    expect(r.firstInvalid).toBeNull(); // still valid 30 days later
  });
});
