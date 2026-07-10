import { describe, it, expect } from "vitest";
import { parseAdditionalUserInputFromProviderProfile } from "better-auth/db";
import { userAdditionalFields } from "@/lib/auth";

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
