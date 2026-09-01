import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, customSession } from "better-auth/plugins";
import { MPHelper } from "@/lib/providers/ministry-platform";
import type { MPUserProfile } from "@/lib/providers/ministry-platform/types";
import { sanitizeGuid } from "@/lib/providers/ministry-platform/utils/filter-sanitize";

const mpBaseUrl = process.env.MINISTRY_PLATFORM_BASE_URL;
const mpOauthUrl = `${mpBaseUrl}/oauth`;

/**
 * Fail at boot when the session-signing secret is missing (2026-05-21 audit,
 * finding #17). Defense-in-depth: better-auth 1.6.x does refuse a missing or
 * default secret in production, but only as an un-awaited rejected promise
 * that surfaces as a 500 on the first request — and outside production it
 * silently accepts its built-in default secret. This converts both into a
 * loud failure at container start.
 *
 * The NEXT_PHASE guard keeps `next build` working (Docker builder stage and
 * CI's bare `npm run build` evaluate this module with no secret supplied).
 */
const betterAuthSecret = process.env.BETTER_AUTH_SECRET;
if (!betterAuthSecret && process.env.NEXT_PHASE !== "phase-production-build") {
  throw new Error(
    "BETTER_AUTH_SECRET is not set. Refusing to start — sessions cannot be signed securely."
  );
}

/**
 * Fetch the OIDC userinfo from Ministry Platform and enrich it with
 * User_ID/Contact_ID from dp_Users for audit attribution.
 *
 * Exported for unit tests. Finding #18 guard: the IdP-supplied `sub` is
 * validated up front, so a malformed subject fails the login instead of
 * minting a session whose raw `sub` bypassed the GUID validation the MP
 * lookup already required.
 */
export async function getMpUserInfo(accessToken: string | undefined) {
  const response = await fetch(`${mpOauthUrl}/connect/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch userinfo: ${response.status}`);
  }

  const profile = await response.json();

  const validGuid = sanitizeGuid(profile.sub);

  // Also fetch User_ID and Contact_ID from dp_Users for audit logging
  let mpUserId: number | undefined;
  let mpContactId: number | undefined;
  let mpNickname: string | undefined;

  try {
    const mp = new MPHelper();
    const records = await mp.getTableRecords<MPUserProfile>({
      table: "dp_Users",
      filter: `User_GUID = '${validGuid}'`,
      select: "User_ID,Contact_ID_TABLE.Contact_ID,Contact_ID_TABLE.Nickname",
      top: 1,
    });
    if (records[0]) {
      mpUserId = records[0].User_ID;
      mpContactId = records[0].Contact_ID;
      mpNickname = records[0].Nickname;
    }
  } catch (error) {
    console.error("Auth: Error fetching MP user profile during login:", error);
  }

  return {
    id: validGuid,
    email: profile.email,
    name: `${mpNickname || profile.given_name || ""} ${profile.family_name || ""}`.trim(),
    image: undefined,
    emailVerified: true,
    userGuid: validGuid,
    mpUserId,
    mpContactId,
  };
}

/**
 * Custom fields added to the Better Auth `user` record.
 *
 * ALL of these fields MUST keep `input: true`. They are populated server-side
 * from the OAuth profile via `mapProfileToUser` below (never from a user-facing
 * form). As of better-auth 1.6, `parseAdditionalUserInputFromProviderProfile`
 * (better-auth/dist/db/schema — `if (schema[key]?.input === false) continue;`)
 * strips any additional field declared with `input: false` BEFORE the user
 * record is created. With `input: false`:
 *   - `userGuid` is dropped -> every MP profile lookup breaks (blank avatar,
 *     dead user menu, `userId: null`, and the session gets trapped — see the
 *     /session-error recovery route in AuthWrapper).
 *   - `mpUserId` is dropped -> audit attribution (`$userId`) on MP writes breaks.
 *   - `mpContactId` is dropped -> contact-scoped lookups break.
 * Since genericOAuth is the only sign-in path and no form sets these fields,
 * allowing input carries no practical risk. `src/lib/auth.test.ts` guards this
 * against future regressions. (Ported from upstream MPNext PR #66.)
 */
export const userAdditionalFields = {
  userGuid: { type: "string" as const, required: false, input: true },
  mpUserId: { type: "number" as const, required: false, input: true },
  mpContactId: { type: "number" as const, required: false, input: true },
};

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  secret: betterAuthSecret,

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60, // 1 hour
      strategy: "jwt",
    },
  },

  user: {
    additionalFields: userAdditionalFields,
  },

  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "ministryplatform",
          discoveryUrl: `${mpOauthUrl}/.well-known/openid-configuration`,
          clientId: process.env.OIDC_CLIENT_ID!,
          clientSecret: process.env.OIDC_CLIENT_SECRET!,
          scopes: ["openid", "offline_access", "http://www.thinkministry.com/dataplatform/scopes/all"],
          pkce: false,
          getUserInfo: async (tokens) => getMpUserInfo(tokens.accessToken),
          mapProfileToUser: (profile) => {
            return {
              userGuid: profile.userGuid,
              mpUserId: profile.mpUserId,
              mpContactId: profile.mpContactId,
            } as Record<string, unknown>;
          },
        },
      ],
    }),
    customSession(async ({ user, session }) => {
      return {
        user: {
          ...user,
          firstName: user.name?.split(" ")[0] || "",
          lastName: user.name?.split(" ").slice(1).join(" ") || "",
        },
        session,
      };
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
