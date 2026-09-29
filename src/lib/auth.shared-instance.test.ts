// @vitest-environment node
//
// Node, not jsdom: under jsdom, jose rejects the key it signs the JWT cookie
// cache with (a cross-realm Uint8Array) and the callback 500s.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Regression guard for one `auth` per process (`sharedInstance` in
 * src/lib/auth.ts, upstream MPNext 0e2652e).
 *
 * Next loads src/lib/auth.ts once per bundle layer — measured 2026-09-29 on a
 * standalone build: the /api/auth route handler gets one copy, server
 * components and server actions share a second. Each copy built its own
 * betterAuth() with its own in-memory store, so the OAuth callback wrote the
 * session row in one store and handleSignOut deleted from the other: a copied
 * session_token outlived sign-out (to the 7-day default, sliding daily).
 *
 * `vi.resetModules()` + a second `import()` reproduces "a second layer".
 * `VITEST` is cleared so the real (non-test) path runs. `fetch` THROWS for any
 * URL the mock does not serve, so nothing here can reach a real MP.
 */

const SUB = "ab12cd34-ef56-7890-abcd-ef1234567890";
const ORIGIN = "http://localhost:3000"; // BETTER_AUTH_URL in src/test-setup.ts

const { requestHeaders, redirectTo } = vi.hoisted(() => {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  const idToken = `h.${Buffer.from(JSON.stringify({ sub: "ab12cd34-ef56-7890-abcd-ef1234567890" })).toString("base64url")}.s`;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "https://test-mp.example.com/oauth/connect/token" && init?.method === "POST") {
      return json({ access_token: "at", token_type: "Bearer", expires_in: 3600, id_token: idToken });
    }
    if (url === "https://test-mp.example.com/oauth/connect/userinfo") {
      return json({ sub: "ab12cd34-ef56-7890-abcd-ef1234567890", email: "jon@example.org", given_name: "Jon", family_name: "Tester" });
    }
    throw new Error(`Blocked unexpected fetch in test: ${url}`);
  }) as typeof fetch;
  return {
    requestHeaders: { current: new Headers() },
    redirectTo: { url: null as string | null },
  };
});

vi.mock("@/lib/providers/ministry-platform", () => ({
  MPHelper: class {
    getTableRecords = vi.fn().mockResolvedValue([{ User_ID: 42, Contact_ID: 99 }]);
  },
}));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectTo.url = url;
  },
}));

type AuthModule = typeof import("@/lib/auth");
type ActionsModule = typeof import("@/components/user-menu/actions");
type StoreModule = typeof import("@/lib/id-token-store");

/** The key src/lib/auth.ts caches the instance under (pinned below). */
const SHARED_AUTH_KEY = Symbol.for("tmc.auth");
const MINUTE = 60 * 1000;
const T0 = new Date("2026-09-29T08:00:00Z").getTime();
const savedVitest = process.env.VITEST;

function applySetCookie(response: Response, into = new Map<string, string>()) {
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(";")[0];
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (value === "" || /max-age=0/i.test(line)) into.delete(name);
    else into.set(name, value);
  }
  return into;
}
const header = (jar: Map<string, string>) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const only = (jar: Map<string, string>, suffix: string) =>
  new Map([...jar].filter(([k]) => k.endsWith(suffix)));

/** A fresh module copy of the route-handler layer (src/lib/auth). */
async function loadRouteLayer(): Promise<AuthModule> {
  vi.resetModules();
  return import("@/lib/auth");
}
/** A fresh module copy of the server-action layer (actions.ts + its own src/lib/auth). */
async function loadActionLayer(): Promise<ActionsModule & { store: StoreModule }> {
  vi.resetModules();
  const actions = await import("@/components/user-menu/actions");
  const store = await import("@/lib/id-token-store");
  return { ...actions, store };
}

async function signIn({ auth }: AuthModule) {
  const start = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ provider: "ministryplatform", callbackURL: "/" }),
    }),
  );
  expect(start.status).toBe(200);
  const jar = applySetCookie(start);
  const state = new URL(((await start.json()) as { url: string }).url).searchParams.get("state")!;
  const back = await auth.handler(
    new Request(`${ORIGIN}/api/auth/callback/ministryplatform?code=abc&state=${encodeURIComponent(state)}`, {
      headers: { cookie: header(jar) },
    }),
  );
  expect(back.status).toBe(302);
  expect(back.headers.get("location")).toBe("/");
  return applySetCookie(back, new Map());
}

async function sessionGuid({ auth }: AuthModule, jar: Map<string, string>) {
  const res = await auth.handler(new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie: header(jar) } }));
  const body = (await res.json()) as { user?: { userGuid?: string } } | null;
  return body?.user?.userGuid ?? null;
}

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[SHARED_AUTH_KEY];
  redirectTo.url = null;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  process.env.VITEST = savedVitest;
  delete (globalThis as Record<symbol, unknown>)[SHARED_AUTH_KEY];
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("sharedInstance", () => {
  it("caches under Symbol.for(\"tmc.auth\")", async () => {
    const mod = await loadRouteLayer();
    expect(mod.SHARED_AUTH_KEY).toBe(SHARED_AUTH_KEY);
  });

  it("two module copies (two Next layers) get the same auth instance outside Vitest", async () => {
    delete process.env.VITEST;
    const a = await loadRouteLayer();
    const b = await loadRouteLayer();
    expect(a).not.toBe(b); // really two module copies
    expect(b.auth).toBe(a.auth);
  });

  it("builds a fresh instance per copy under Vitest", async () => {
    const a = await loadRouteLayer();
    const b = await loadRouteLayer();
    expect(b.auth).not.toBe(a.auth);
  });
});

describe("sign-in in the route layer, the REAL handleSignOut in the action layer", () => {
  async function run({ dropIdTokenStore }: { dropIdTokenStore: boolean }) {
    const route = await loadRouteLayer();
    const jar = await signIn(route);
    const copied = new Map(jar); // an attacker's copy, taken before sign-out
    expect(await sessionGuid(route, jar)).toBe(SUB);

    // The browser's cookie cache has lapsed (the 1h JWT cookie is gone) and
    // there is no refreshSessionCookie() in front of this call.
    vi.setSystemTime(T0 + 61 * MINUTE);
    const action = await loadActionLayer();
    if (dropIdTokenStore) action.store.__resetIdTokenStore(); // e.g. a sign-in before the last restart
    requestHeaders.current = new Headers({ cookie: header(only(jar, "session_token")) });
    await action.handleSignOut();

    const endSession = new URL(redirectTo.url!).searchParams;
    expect(endSession.get("client_id")).toBe("test-client-id"); // OIDC_CLIENT_ID in src/test-setup.ts
    const hint = endSession.get("id_token_hint");
    const replayed = await sessionGuid(route, only(copied, "session_token"));
    return { hint, replayed };
  }

  it("shared: sign-out finds the session, sends id_token_hint, and the copied token is dead", async () => {
    delete process.env.VITEST;
    const { hint, replayed } = await run({ dropIdTokenStore: false });
    expect(hint).toBeTruthy();
    expect(replayed).toBeNull();
  });

  it("shared: the account-row fallback supplies the hint when the id-token store is empty", async () => {
    delete process.env.VITEST;
    const { hint } = await run({ dropIdTokenStore: true });
    expect(hint).toBeTruthy();
  });

  it("negative control: separate copies (the pre-fix behaviour) lose the hint and leave the copy alive", async () => {
    process.env.VITEST = "true";
    const { hint, replayed } = await run({ dropIdTokenStore: false });
    expect(hint).toBeNull();
    expect(replayed).toBe(SUB);
  });
});
