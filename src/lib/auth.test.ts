import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseAdditionalUserInputFromProviderProfile } from "better-auth/db";
import { userAdditionalFields, getMpUserInfo } from "@/lib/auth";

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

  const stubUserinfo = (sub: string) =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ sub, email: "jon@example.org", given_name: "Jon", family_name: "Tester" }),
      })
    );

  beforeEach(() => {
    mockGetTableRecords.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a malformed sub before any MP lookup", async () => {
    stubUserinfo("not-a-guid'; DROP TABLE dp_Users;--");

    await expect(getMpUserInfo("token")).rejects.toThrow(/Invalid GUID/);
    expect(mockGetTableRecords).not.toHaveBeenCalled();
  });

  it("returns the validated GUID as both id and userGuid", async () => {
    stubUserinfo(VALID_SUB);
    mockGetTableRecords.mockResolvedValue([
      { User_ID: 42, Contact_ID: 99, Nickname: "Jonny" },
    ]);

    const user = await getMpUserInfo("token");

    expect(user.id).toBe(VALID_SUB);
    expect(user.userGuid).toBe(VALID_SUB);
    expect(user.mpUserId).toBe(42);
    expect(user.mpContactId).toBe(99);
    expect(user.name).toBe("Jonny Tester");
  });

  it("still returns the user when the MP enrichment lookup fails", async () => {
    stubUserinfo(VALID_SUB);
    mockGetTableRecords.mockRejectedValue(new Error("MP is down"));

    const user = await getMpUserInfo("token");

    expect(user.id).toBe(VALID_SUB);
    expect(user.mpUserId).toBeUndefined();
    expect(user.name).toBe("Jon Tester");
  });

  it("throws on a non-OK userinfo response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(getMpUserInfo("token")).rejects.toThrow(/401/);
  });
});
