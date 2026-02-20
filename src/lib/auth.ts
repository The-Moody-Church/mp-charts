import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, customSession } from "better-auth/plugins";
import { MPHelper } from "@/lib/providers/ministry-platform";
import type { MPUserProfile } from "@/lib/providers/ministry-platform/types";

const mpBaseUrl = process.env.MINISTRY_PLATFORM_BASE_URL;
const mpOauthUrl = `${mpBaseUrl}/oauth`;

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET || process.env.NEXTAUTH_SECRET,

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60, // 1 hour
      strategy: "jwt",
    },
  },

  user: {
    additionalFields: {
      userGuid: { type: "string", required: false, input: false },
      mpUserId: { type: "number", required: false, input: false },
      mpContactId: { type: "number", required: false, input: false },
    },
  },

  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "ministry-platform",
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

            try {
              const mp = new MPHelper();
              const records = await mp.getTableRecords<MPUserProfile>({
                table: "dp_Users",
                filter: `User_GUID = '${profile.sub}'`,
                select: "User_ID,Contact_ID",
                top: 1,
              });
              if (records[0]) {
                mpUserId = records[0].User_ID;
                mpContactId = records[0].Contact_ID;
              }
            } catch (error) {
              console.error("Auth: Error fetching MP user profile during login:", error);
            }

            return {
              id: profile.sub,
              email: profile.email,
              name: `${profile.given_name || ""} ${profile.family_name || ""}`.trim(),
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
