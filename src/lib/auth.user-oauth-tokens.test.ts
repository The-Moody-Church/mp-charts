// @vitest-environment node
//
// Node, not jsdom: under jsdom, jose rejects the key it signs the JWT cookie
// cache with (a cross-realm Uint8Array) and the callback 500s.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Guard for "the user's own MP OAuth tokens are not kept" (upstream MPNext
 * a424953, ported to our explicit-endpoint provider).
 *
 * Nothing in this app uses the user's MP access or refresh token after
 * sign-in: every MP data call goes through the client-credentials service
 * account. So after a real sign-in through the REAL `auth` instance:
 *
 * - no `account_data` cookie reaches the browser (`storeAccountCookie: false`);
 * - the in-memory account row holds no access/refresh token or expiry, on the
 *   first sign-in (create hook) AND a repeat sign-in (update hook);
 * - the idToken IS kept — sign-out's account-row fallback sends it as
 *   `id_token_hint`.
 *
 * The fake MP's token endpoint returns a refresh token on purpose, so the
 * strip is exercised even though we never ask for `offline_access`. `fetch`
 * THROWS for any URL it does not serve, so nothing here can reach a real MP.
 */

const SUB = "ab12cd34-ef56-7890-abcd-ef1234567890";
const ORIGIN = "http://localhost:3000"; // BETTER_AUTH_URL in src/test-setup.ts

/** Who the fake MP signs in. Tests that need a FIRST sign-in pick a fresh sub. */
const mp = vi.hoisted(() => {
  const state = { sub: "ab12cd34-ef56-7890-abcd-ef1234567890" };
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "https://test-mp.example.com/oauth/connect/token" && init?.method === "POST") {
      return json({
        access_token: "user-access-token",
        refresh_token: "user-refresh-token",
        token_type: "Bearer",
        expires_in: 3600,
        id_token: `h.${Buffer.from(JSON.stringify({ sub: state.sub })).toString("base64url")}.s`,
      });
    }
    if (url === "https://test-mp.example.com/oauth/connect/userinfo") {
      return json({ sub: state.sub, given_name: "Token", family_name: "Minimal" });
    }
    throw new Error(`Blocked unexpected fetch in test: ${url}`);
  }) as typeof fetch;
  return state;
});

vi.mock("@/lib/providers/ministry-platform", () => ({
  MPHelper: class {
    getTableRecords = vi.fn().mockResolvedValue([{ User_ID: 42, Contact_ID: 99 }]);
  },
}));

import { auth, stripUserOAuthTokens } from "@/lib/auth";
import { MP_PROVIDER_ID } from "@/lib/auth-endsession";

function cookiePairs(response: Response): Map<string, string> {
  const jar = new Map<string, string>();
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(";")[0];
    const eq = pair.indexOf("=");
    const value = pair.slice(eq + 1).trim();
    if (value !== "") jar.set(pair.slice(0, eq).trim(), value);
  }
  return jar;
}
const header = (jar: Map<string, string>) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function signIn() {
  const start = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ provider: MP_PROVIDER_ID, callbackURL: "/" }),
    }),
  );
  expect(start.status).toBe(200);
  const state = new URL(((await start.json()) as { url: string }).url).searchParams.get("state")!;
  const callback = await auth.handler(
    new Request(`${ORIGIN}/api/auth/callback/${MP_PROVIDER_ID}?code=abc&state=${encodeURIComponent(state)}`, {
      headers: { cookie: header(cookiePairs(start)) },
    }),
  );
  expect(callback.status).toBe(302);
  expect(callback.headers.get("location")).toBe("/");
  const cookies = cookiePairs(callback);
  const session = await auth.api.getSession({ headers: new Headers({ cookie: header(cookies) }) });
  // customSession's inferred user type omits the additional fields; they are there at runtime.
  expect((session?.user as { userGuid?: string } | undefined)?.userGuid).toBe(mp.sub);
  const context = await auth.$context;
  const accounts = await context.internalAdapter.findAccounts(session!.user.id);
  return { cookies, accounts };
}

beforeEach(() => {
  mp.sub = SUB;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the user's MP OAuth tokens are not retained", () => {
  it("pins storeAccountCookie: false", () => {
    expect(auth.options.account?.storeAccountCookie).toBe(false);
  });

  it("sets no account_data cookie — only the session cookies reach the browser", async () => {
    const { cookies } = await signIn();
    const names = [...cookies.keys()];
    expect(names.some((n) => n.includes("account_data"))).toBe(false);
    expect(names.some((n) => n.endsWith("session_token"))).toBe(true);
    expect(names.some((n) => n.endsWith("session_data"))).toBe(true);
    for (const value of cookies.values()) {
      expect(value).not.toContain("user-access-token");
      expect(value).not.toContain("user-refresh-token");
    }
  });

  it("keeps no access/refresh token in the account row, on first and repeat sign-in, but keeps the idToken", async () => {
    // A sub no earlier test signed in, so pass 0 goes through the create hook
    // and pass 1 through the update hook.
    mp.sub = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    for (let i = 0; i < 2; i++) {
      const { accounts } = await signIn();
      expect(accounts).toHaveLength(1);
      const [account] = accounts;
      expect(account.providerId).toBe(MP_PROVIDER_ID);
      expect(account.accessToken ?? null).toBeNull();
      expect(account.refreshToken ?? null).toBeNull();
      expect(account.accessTokenExpiresAt ?? null).toBeNull();
      expect(account.refreshTokenExpiresAt ?? null).toBeNull();
      // Kept deliberately: sign-out's account-row fallback sends it.
      expect(account.idToken).toBeTruthy();
    }
  });
});

describe("stripUserOAuthTokens", () => {
  it("blanks the tokens and expiries, keeps everything else, and does not mutate its input", () => {
    const input = {
      accountId: SUB,
      providerId: MP_PROVIDER_ID,
      idToken: "id",
      accessToken: "a",
      refreshToken: "r",
      accessTokenExpiresAt: new Date(),
      refreshTokenExpiresAt: new Date(),
    };
    expect(stripUserOAuthTokens(input)).toEqual({
      accountId: SUB,
      providerId: MP_PROVIDER_ID,
      idToken: "id",
      accessToken: null,
      refreshToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    });
    expect(input.accessToken).toBe("a");
  });
});
