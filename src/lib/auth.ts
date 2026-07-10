import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, customSession } from "better-auth/plugins";
import { MPHelper } from "@/lib/providers/ministry-platform";
import type { MPUserProfile } from "@/lib/providers/ministry-platform/types";
import { sanitizeGuid } from "@/lib/providers/ministry-platform/utils/filter-sanitize";

const mpBaseUrl = process.env.MINISTRY_PLATFORM_BASE_URL;
const mpOauthUrl = `${mpBaseUrl}/oauth`;

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
  secret: process.env.BETTER_AUTH_SECRET,

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
          getUserInfo: async (tokens) => {
            // Fetch OIDC userinfo from Ministry Platform
            const response = await fetch(`${mpOauthUrl}/connect/userinfo`, {
              headers: { Authorization: `Bearer ${tokens.accessToken}` },
            });

            if (!response.ok) {
              throw new Error(`Failed to fetch userinfo: ${response.status}`);
            }

            const profile = await response.json();

            // Also fetch User_ID and Contact_ID from dp_Users for audit logging
            let mpUserId: number | undefined;
            let mpContactId: number | undefined;
            let mpNickname: string | undefined;

            try {
              const validGuid = sanitizeGuid(profile.sub);
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
              id: profile.sub,
              email: profile.email,
              name: `${mpNickname || profile.given_name || ""} ${profile.family_name || ""}`.trim(),
              image: undefined,
              emailVerified: true,
              userGuid: profile.sub,
              mpUserId,
              mpContactId,
            };
          },
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
