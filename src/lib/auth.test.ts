import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseAdditionalUserInputFromProviderProfile } from "better-auth/db";
import {
  userAdditionalFields,
  getMpUserInfo,
  disabledAuthPaths,
  syntheticEmailForSub,
  mapMpProfileToUser,
  SYNTHETIC_EMAIL_DOMAIN,
  auth,
} from "@/lib/auth";

const { mockGetTableRecords } = vi.hoisted(() => ({
  mockGetTableRecords: vi.fn(),
}));

vi.mock("@/lib/providers/ministry-platform", () => ({
  MPHelper: class {
    getTableRecords = mockGetTableRecords;
  },
}));

/**
 * Auth field-config guard.
 *
 * Regression guard for the better-auth 1.6 upgrade incident (upstream MPNext
 * PR #66; our better-auth bump to ^1.6.23 in PR #191).
 *
 * As of better-auth 1.6, `parseAdditionalUserInputFromProviderProfile` strips
 * any user additional field declared with `input: false` BEFORE the user record
 * is created (`better-auth/dist/db/schema` — `if (schema[key]?.input === false)
 * continue;`). Our `userGuid`, `mpUserId`, and `mpContactId` are all populated
 * server-side from the OAuth profile via `mapProfileToUser`, so `input: false`
 * silently dropped them — leaving the session with `userGuid`/`mpUserId`/
 * `mpContactId` undefined and breaking MP profile lookups (avatar, user menu,
 * User_ID resolution) and audit attribution (`$userId`).
 *
 * These tests run the REAL better-auth field-filtering function against our REAL
 * field config, so they fail if either (a) someone flips a field back to
 * `input: false`, or (b) a future better-auth upgrade changes how
 * provider-profile fields are parsed.
 */
describe("userAdditionalFields", () => {
  it("declares userGuid, mpUserId, and mpContactId with input:true", () => {
    for (const field of ["userGuid", "mpUserId", "mpContactId"] as const) {
      expect(userAdditionalFields[field]).toBeDefined();
      // input:true is mandatory — see the comment in src/lib/auth.ts.
      expect(userAdditionalFields[field].input).toBe(true);
    }
  });

  it("persists all three fields from the OAuth provider profile (better-auth 1.6 guard)", () => {
    const guid = "ab12cd34-ef56-7890-abcd-ef1234567890";
    const options = { user: { additionalFields: userAdditionalFields } };

    // Mirrors the object better-auth builds from `mapProfileToUser`'s return
    // before creating the user record.
    const parsed = parseAdditionalUserInputFromProviderProfile(
      options,
      { userGuid: guid, mpUserId: 42, mpContactId: 99 },
      "create",
    );

    expect(parsed).toHaveProperty("userGuid", guid);
    expect(parsed).toHaveProperty("mpUserId", 42);
    expect(parsed).toHaveProperty("mpContactId", 99);
  });
});

/**
 * Finding #17 (2026-05-21 audit): the module must refuse to load without a
 * session-signing secret — except during `next build`, where no secret is
 * supplied (Docker builder stage, CI's bare `npm run build`).
 */
describe("BETTER_AUTH_SECRET fail-fast", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws at module load when the secret is missing", async () => {
    vi.resetModules();
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    await expect(import("@/lib/auth")).rejects.toThrow(/BETTER_AUTH_SECRET/);
  });

  it("skips the check during next build (NEXT_PHASE=phase-production-build)", async () => {
    vi.resetModules();
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    await expect(import("@/lib/auth")).resolves.toBeDefined();
  });
});

/**
 * Finding #18 (2026-05-21 audit): the IdP-supplied `sub` must be validated
 * before it becomes the account id / userGuid. Previously the validated GUID
 * was only used for the MP lookup while the raw `sub` was returned.
 */
describe("getMpUserInfo", () => {
  const VALID_SUB = "ab12cd34-ef56-7890-abcd-ef1234567890";

  const stubUserinfo = (sub: string, extra: Record<string, unknown> = {}) =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            sub,
            email: "jon@example.org",
            given_name: "Jon",
            family_name: "Tester",
            ...extra,
          }),
      })
    );

  beforeEach(() => {
    mockGetTableRecords.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null (not throws) for a malformed sub, before any MP lookup", async () => {
    // better-auth 1.6 does NOT wrap getUserInfo in a try/catch, so a throw
    // escapes as an unhandled error instead of the clean user_info_is_missing
    // redirect a null return produces. Regression guard for that distinction.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    stubUserinfo("not-a-guid'; DROP TABLE dp_Users;--");

    await expect(getMpUserInfo("token")).resolves.toBeNull();
    expect(mockGetTableRecords).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("auth.userinfo.invalid_sub")
    );
    errorSpy.mockRestore();
  });

  it("returns null when the profile carries no sub at all", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ email: "x@y.z" }) })
    );

    await expect(getMpUserInfo("token")).resolves.toBeNull();
    expect(mockGetTableRecords).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns the validated GUID as both id and userGuid", async () => {
    stubUserinfo(VALID_SUB);
    mockGetTableRecords.mockResolvedValue([
      { User_ID: 42, Contact_ID: 99, Nickname: "Jonny" },
    ]);

    const user = await getMpUserInfo("token");

    expect(user).not.toBeNull();
    expect(user!.id).toBe(VALID_SUB);
    expect(user!.userGuid).toBe(VALID_SUB);
    expect(user!.mpUserId).toBe(42);
    expect(user!.mpContactId).toBe(99);
    expect(user!.name).toBe("Jonny Tester");
  });

  it("still returns the user when the MP enrichment lookup fails", async () => {
    stubUserinfo(VALID_SUB);
    mockGetTableRecords.mockRejectedValue(new Error("MP is down"));

    const user = await getMpUserInfo("token");

    expect(user).not.toBeNull();
    expect(user!.id).toBe(VALID_SUB);
    expect(user!.mpUserId).toBeUndefined();
    expect(user!.name).toBe("Jon Tester");
  });

  it("throws on a non-OK userinfo response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(getMpUserInfo("token")).rejects.toThrow(/401/);
  });

  // F2: emailVerified drives better-auth's implicit account-linking decision.
  // It must reflect MP's claim, never a hardcoded true.
  it("defaults emailVerified to false when MP omits the email_verified claim", async () => {
    stubUserinfo(VALID_SUB);
    mockGetTableRecords.mockResolvedValue([]);

    const user = await getMpUserInfo("token");

    expect(user!.emailVerified).toBe(false);
  });

  it("sets emailVerified true only when MP explicitly claims it", async () => {
    stubUserinfo(VALID_SUB, { email_verified: true });
    mockGetTableRecords.mockResolvedValue([]);

    expect((await getMpUserInfo("token"))!.emailVerified).toBe(true);

    stubUserinfo(VALID_SUB, { email_verified: "true" });
    expect((await getMpUserInfo("token"))!.emailVerified).toBe(false);
  });
});

/**
 * F-UPDATE-USER (GHSA-pqxp-c5mr-5398) — session identity was reassignable.
 *
 * These drive the REAL `auth.handler`, not a mock of it, so they fail if the
 * `disabledPaths` option is removed or renamed by a better-auth upgrade.
 * Both halves are asserted on purpose: that the paths 404, AND that
 * `userGuid` is still writable from the provider profile. A "fix" that closes
 * the endpoint by breaking sign-in is not a fix.
 */
describe("disabled account-management endpoints", () => {
  const call = (path: string, method: "GET" | "POST" = "POST") =>
    auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "POST" ? { body: "{}" } : {}),
      })
    );

  it("pins the exact set of disabled paths", () => {
    expect(disabledAuthPaths).toEqual([
      "/update-user",
      "/change-email",
      "/change-password",
      "/set-password",
      "/delete-user",
      "/delete-user/callback",
    ]);
  });

  it("wires disabledAuthPaths into the better-auth options", () => {
    expect(auth.options.disabledPaths).toBe(disabledAuthPaths);
  });

  it("returns 404 for POST /update-user — session identity is not reassignable", async () => {
    // The attack: any authenticated user POSTing themselves another user's
    // MP User_GUID. 404 means the router refused before sessionMiddleware.
    const res = await call("/update-user");
    expect(res.status).toBe(404);
  });

  it.each([
    "/change-email",
    "/change-password",
    "/set-password",
    "/delete-user",
    "/delete-user/callback",
  ])("returns 404 for POST %s", async (path) => {
    expect((await call(path)).status).toBe(404);
  });

  // Negative control: without this the suite could pass vacuously (e.g. if
  // every path 404'd because the handler was misconfigured).
  it("still routes an endpoint that is NOT disabled", async () => {
    const res = await call("/get-session", "GET");
    expect(res.status).not.toBe(404);
  });
});

/**
 * F2 — a shared Ministry Platform email must not merge two people onto one
 * better-auth identity. MP enforces no uniqueness on email addresses.
 */
describe("account identity (F2)", () => {
  it("disables implicit account linking", () => {
    expect(auth.options.account?.accountLinking?.enabled).toBe(false);
  });

  it("sends OAuth callback failures to our own /auth-error page", () => {
    expect(auth.options.onAPIError?.errorURL).toBe("/auth-error");
  });

  it("derives a synthetic, non-routable email from the sub", () => {
    const sub = "AB12CD34-EF56-7890-ABCD-EF1234567890";
    expect(syntheticEmailForSub(sub)).toBe(
      `ab12cd34-ef56-7890-abcd-ef1234567890@${SYNTHETIC_EMAIL_DOMAIN}`
    );
    // RFC 2606 reserved TLD — guaranteed never to reach a real mailbox.
    expect(SYNTHETIC_EMAIL_DOMAIN).toBe("mp.invalid");
  });

  it("gives two subs sharing one real email two DISTINCT better-auth emails", () => {
    const a = "ab12cd34-ef56-7890-abcd-ef1234567890";
    const b = "ffffffff-ef56-7890-abcd-ef1234567890";
    expect(syntheticEmailForSub(a)).not.toBe(syntheticEmailForSub(b));
  });

  it("requires userGuid and allows a null mpEmail", () => {
    // required:true makes parseInputData refuse to create a user with no MP
    // identity. mpEmail must stay optional — MP does not require an email.
    expect(userAdditionalFields.userGuid.required).toBe(true);
    expect(userAdditionalFields.mpEmail.required).toBe(false);
  });

  it("maps the provider profile to a synthetic email and a real mpEmail", () => {
    const mapped = mapMpProfileToUser({
      userGuid: "AB12CD34-EF56-7890-ABCD-EF1234567890",
      email: "shared@example.org",
      mpUserId: 42,
      mpContactId: 99,
    });

    expect(mapped.email).toBe(
      `ab12cd34-ef56-7890-abcd-ef1234567890@${SYNTHETIC_EMAIL_DOMAIN}`
    );
    expect(mapped.mpEmail).toBe("shared@example.org");
    expect(mapped.userGuid).toBe("AB12CD34-EF56-7890-ABCD-EF1234567890");
    expect(mapped.mpUserId).toBe(42);
    expect(mapped.mpContactId).toBe(99);
  });

  it("never hands a real MP email to better-auth as the user email (F2 root cause)", () => {
    // Two MP users sharing one household address must not collide on
    // better-auth's unique `email` column.
    const one = mapMpProfileToUser({
      userGuid: "ab12cd34-ef56-7890-abcd-ef1234567890",
      email: "household@example.org",
    });
    const two = mapMpProfileToUser({
      userGuid: "ffffffff-ef56-7890-abcd-ef1234567890",
      email: "household@example.org",
    });

    expect(one.email).not.toBe("household@example.org");
    expect(two.email).not.toBe("household@example.org");
    expect(one.email).not.toBe(two.email);
    expect(one.mpEmail).toBe("household@example.org");
    expect(two.mpEmail).toBe("household@example.org");
  });

  it("maps a missing MP email to null rather than an empty string", () => {
    expect(
      mapMpProfileToUser({ userGuid: "ab12cd34-ef56-7890-abcd-ef1234567890" }).mpEmail
    ).toBeNull();
  });

  it("throws rather than minting a user with an empty userGuid", () => {
    expect(() => mapMpProfileToUser({ userGuid: "" })).toThrow(/no usable sub/);
    expect(() => mapMpProfileToUser({})).toThrow(/no usable sub/);
  });
});
