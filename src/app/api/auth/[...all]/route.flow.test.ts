// @vitest-environment node
//
// Node, not the repo's default jsdom: under jsdom, jose rejects the key it signs
// the JWT cookie cache with (a cross-realm Uint8Array) and the callback 500s.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * The whole better-auth 1.7 sign-in, end to end through the REAL exported route
 * handlers and the REAL auth config, against a fake Ministry Platform.
 *
 * The other auth tests pin the pieces (config values, our getUserInfo, our
 * mapProfileToUser). This is the only test that runs better-auth's own code in
 * between: the provider wrapper that merges `{ email: raw.email, …, ...mapped }`,
 * the callback, account creation, the token exchange (where `pkce: false` must
 * keep `code_verifier` out) and the session cookie. A better-auth patch that
 * changes any of that passes every other test and fails here.
 *
 * Kept out of route.test.ts on purpose: that file asserts the auth module makes
 * NO network call at all, which this one necessarily does (to the fake MP).
 */

const SUB = "ab12cd34-ef56-7890-abcd-ef1234567890";
const OTHER_SUB = "ffffffff-ef56-7890-abcd-ef1234567890";
const ORIGIN = "http://localhost:3000"; // BETTER_AUTH_URL in src/test-setup.ts

const { mockGetTableRecords, mp } = vi.hoisted(() => {
  const mp = {
    tokenBody: "",
    userinfoStatus: 200,
    idTokenSub: "ab12cd34-ef56-7890-abcd-ef1234567890",
  };
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.startsWith("https://test-mp.example.com/oauth/connect/token")) {
        mp.tokenBody = String(init?.body ?? "");
        const idToken = `h.${Buffer.from(JSON.stringify({ sub: mp.idTokenSub })).toString("base64url")}.s`;
        return json({ access_token: "at", token_type: "Bearer", expires_in: 3600, id_token: idToken });
      }
      // Strict, like the real MP: the exact userinfo path (a startsWith would
      // also accept `/connect/userinfoX`) and the token endpoint's access token
      // as a Bearer credential. getMpUserInfo builds this request itself rather
      // than reading `userInfoUrl` from the config, so the config pin in
      // auth.test.ts does not cover it; a wrong path or a missing header would
      // otherwise pass here and fail every production sign-in.
      if (url === "https://test-mp.example.com/oauth/connect/userinfo") {
        if (new Headers(init?.headers).get("authorization") !== "Bearer at") {
          return new Response("", { status: 401 });
        }
        if (mp.userinfoStatus !== 200) return new Response("", { status: mp.userinfoStatus });
        return json({
          sub: "ab12cd34-ef56-7890-abcd-ef1234567890",
          email: "jon@example.org",
          given_name: "Jon",
          family_name: "Tester",
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    })
  );
  return { mockGetTableRecords: vi.fn(), mp };
});

vi.mock("@/lib/providers/ministry-platform", () => ({
  MPHelper: class {
    getTableRecords = mockGetTableRecords;
  },
}));

import { GET, POST } from "./route";
import { takeIdToken, __resetIdTokenStore } from "@/lib/id-token-store";

const cookiesOf = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

/** POST /sign-in/social exactly as the browser client does; returns what MP would be handed. */
async function startSignIn() {
  const res = await POST(
    new NextRequest(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ provider: "ministryplatform", callbackURL: "/dash" }),
    })
  );
  expect(res.status).toBe(200);
  const authorize = new URL((await res.json()).url);
  return { authorize, state: authorize.searchParams.get("state")!, cookie: cookiesOf(res) };
}

/** MP's redirect back to us after the user signs in. */
async function returnFromMp(state: string, cookie: string) {
  return GET(
    new NextRequest(`${ORIGIN}/api/auth/callback/ministryplatform?code=abc&state=${state}`, {
      headers: { cookie },
    })
  );
}

describe("better-auth 1.7 sign-in, end to end through the real route", () => {
  beforeEach(() => {
    mockGetTableRecords.mockReset();
    mockGetTableRecords.mockResolvedValue([{ User_ID: 42, Contact_ID: 99 }]);
    mp.tokenBody = "";
    mp.userinfoStatus = 200;
    mp.idTokenSub = SUB;
    __resetIdTokenStore();
  });

  it("signs in, lands on the callback URL, and the session carries every MP field", async () => {
    const { state, cookie } = await startSignIn();

    const back = await returnFromMp(state, cookie);
    expect(back.status).toBe(302);
    expect(back.headers.get("location")).toBe("/dash");

    const session = await (
      await GET(new NextRequest(`${ORIGIN}/api/auth/get-session`, { headers: { cookie: cookiesOf(back) } }))
    ).json();
    expect(session.user).toMatchObject({
      email: `${SUB}@mp.invalid`, // synthetic — never the real address
      mpEmail: "jon@example.org",
      userGuid: SUB,
      mpUserId: 42,
      mpContactId: 99,
    });
    // The ID token is kept for sign-out's id_token_hint.
    expect(takeIdToken(SUB)).toBe(`h.${Buffer.from(JSON.stringify({ sub: SUB })).toString("base64url")}.s`);
  });

  it("re-issues session_data from session_token alone — what sign-out's cookie refresh relies on", async () => {
    // The sign-out server action reads the session only from the session_data
    // cookie cache (its own in-memory store is empty), so the user menu calls
    // GET /get-session first to re-mint that cookie. This pins that the route
    // does re-mint it once the cache is gone — the same state as a lapsed
    // one-hour cache, or deleting the cookie by hand.
    const { state, cookie } = await startSignIn();
    const back = await returnFromMp(state, cookie);
    const tokenOnly = cookiesOf(back)
      .split("; ")
      .filter((c) => c.includes("session_token="))
      .join("; ");
    expect(tokenOnly).not.toBe("");
    expect(tokenOnly).not.toContain("session_data=");

    const res = await GET(new NextRequest(`${ORIGIN}/api/auth/get-session`, { headers: { cookie: tokenOnly } }));

    expect(res.status).toBe(200);
    expect((await res.json()).user).toMatchObject({ userGuid: SUB });
    const reissued = res.headers.getSetCookie().find((c) => c.split("=")[0].endsWith("session_data"));
    expect(reissued).toBeDefined();
    expect(reissued).toMatch(/Max-Age=3600/i);
  });

  it("exchanges the code with the registered redirect URI and no PKCE verifier", async () => {
    const { authorize, state, cookie } = await startSignIn();
    await returnFromMp(state, cookie);

    const token = new URLSearchParams(mp.tokenBody);
    expect(token.get("grant_type")).toBe("authorization_code");
    expect(token.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/callback/ministryplatform`);
    expect(token.get("redirect_uri")).toBe(authorize.searchParams.get("redirect_uri"));
    // pkce:false must hold at the TOKEN exchange too, not just the authorize URL:
    // the sign-in client rejects a code_verifier with invalid_grant.
    expect(token.has("code_verifier")).toBe(false);
  });

  it("sends the user to /auth-error when MP's userinfo fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mp.userinfoStatus = 503;
    const { state, cookie } = await startSignIn();

    const back = await returnFromMp(state, cookie);
    expect(back.headers.get("location")).toMatch(/^\/auth-error\?error=unable_to_get_user_info/);
    errorSpy.mockRestore();
  });

  it("refuses a token response whose ID token names a different user", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mp.idTokenSub = OTHER_SUB;
    const { state, cookie } = await startSignIn();

    const back = await returnFromMp(state, cookie);
    expect(back.headers.get("location")).toMatch(/^\/auth-error\?error=unable_to_get_user_info/);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("auth.userinfo.sub_mismatch"));
    expect(takeIdToken(SUB)).toBeNull();
    errorSpy.mockRestore();
  });
});
