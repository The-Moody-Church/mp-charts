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

  // Refuse an unusable subject by returning null, NOT by throwing.
  // better-auth 1.6 does not wrap `getUserInfo` in a try/catch
  // (node_modules/better-auth/dist/plugins/generic-oauth/routes.mjs — the
  // `handleUserInfo` IIFE calls it directly), so a throw here escapes as an
  // unhandled error instead of the clean `user_info_is_missing` redirect the
  // callback produces for a null return. (Upstream MPNext 7da14c5.)
  let validGuid: string;
  try {
    validGuid = sanitizeGuid(profile.sub);
  } catch {
    console.error(
      JSON.stringify({ event: "auth.userinfo.invalid_sub", reason: "sub_not_a_guid" })
    );
    return null;
  }

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
    // The REAL Ministry Platform address. `mapProfileToUser` moves it to the
    // `mpEmail` field and hands better-auth a synthetic value instead — see
    // `syntheticEmailForSub` and the F2 note on `userAdditionalFields`.
    email: profile.email,
    name: `${mpNickname || profile.given_name || ""} ${profile.family_name || ""}`.trim(),
    image: undefined,
    // MUST reflect the provider's own claim, never a hardcoded `true`.
    // better-auth's OAuth callback uses `emailVerified` (on both the incoming
    // profile and the stored user) to decide whether to implicitly link a new
    // provider account onto an EXISTING user found by email — the F2 takeover.
    // `accountLinking.enabled: false` below is the primary guard; this is the
    // second. MP may omit the claim entirely, in which case false is correct.
    emailVerified: profile.email_verified === true,
    userGuid: validGuid,
    mpUserId,
    mpContactId,
  };
}

/**
 * Ministry Platform enforces NO uniqueness on email addresses — households
 * routinely share one across contacts, each of whom may hold a `dp_Users`
 * login. better-auth's core user schema declares `email` as required AND
 * unique, and its OAuth callback uses `findUserByEmail` as a fallback identity
 * lookup, so a real MP address must never reach that column.
 *
 * The only unique identity MP gives us is `sub` (the `User_GUID`), so that is
 * what better-auth's `email` is derived from. `mp.invalid` is an RFC 2606
 * reserved TLD: the value is guaranteed never to resolve to, or collide with,
 * a real mailbox. The real address lives on the `mpEmail` field.
 *
 * (F2, upstream MPNext 7da14c5.)
 */
export const SYNTHETIC_EMAIL_DOMAIN = "mp.invalid";

export function syntheticEmailForSub(sub: string): string {
  return `${sub.toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
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
  // `required: true` makes better-auth's `parseInputData` refuse to create a
  // user record with no MP identity, instead of minting a session whose
  // `userGuid` is empty and which AuthWrapper can only bounce to
  // /session-error.
  userGuid: { type: "string" as const, required: true, input: true },
  mpUserId: { type: "number" as const, required: false, input: true },
  mpContactId: { type: "number" as const, required: false, input: true },
  // The real MP email address. Nullable on purpose: MP does not require an
  // email, and sign-in must not depend on one. Read this for display, NEVER
  // `session.user.email` — that is the synthetic <sub>@mp.invalid value.
  mpEmail: { type: "string" as const, required: false, input: true },
};

/**
 * better-auth endpoints this app must never expose.
 *
 * `POST /update-user` accepts a body of `z.record(z.string(), z.any())`,
 * rejects only `email`, and copies every other key that maps to an additional
 * field declared `input !== false` VERBATIM, with no validator, then re-mints
 * the session cookie from the result. Its only gate is `sessionMiddleware`,
 * which any valid session cookie satisfies. Our `userGuid` / `mpUserId` /
 * `mpContactId` must all stay `input: true` for sign-in to work (see above),
 * so any authenticated user could POST themselves another user's MP identity
 * and inherit their User Groups on every `requireFeatureAccess` check and
 * their `User_ID` on every MP write.
 *
 * `input: false` is NOT an alternative — as of better-auth 1.6 that one flag
 * governs both "may the provider profile populate this" (needs true) and "may
 * a user POST this" (needs false). No value satisfies both. A field-level
 * `validator.input` is not one either: it runs on the provider-profile path
 * too, so it can constrain the GUID's shape but cannot tell `mapProfileToUser`
 * from an attacker sending a well-formed GUID. The protection has to live at
 * the endpoint.
 *
 * `disabledPaths` is matched in the router's `onRequest` — before rate
 * limiting, plugins and `sessionMiddleware` — so these 404 for authenticated
 * and anonymous callers alike. The rest are closed because identity belongs to
 * Ministry Platform: this app does no self-service account management and
 * calls none of them. `/set-password` is never mounted without a credential
 * provider, so it 404s either way; it is listed so that adding one later does
 * not silently open it.
 *
 * The deny-by-default allowlist in `src/app/api/auth/[...all]/route.ts` is the
 * PRIMARY control; this list is defense in depth, and is what
 * `src/lib/auth.test.ts` drives directly against `auth.handler`.
 *
 * (F-UPDATE-USER / GHSA-pqxp-c5mr-5398, upstream MPNext 436466d.)
 */
export const disabledAuthPaths = [
  "/update-user",
  "/change-email",
  "/change-password",
  "/set-password",
  "/delete-user",
  "/delete-user/callback",
];

/**
 * Builds the better-auth user record from the profile `getMpUserInfo` returned.
 *
 * Exported so `src/lib/auth.test.ts` can drive it directly — reaching it back
 * off the constructed plugin config is brittle.
 *
 * Note it hands better-auth a SYNTHETIC email and moves the real Ministry
 * Platform address to `mpEmail`. better-auth's OAuth callback prefers the
 * mapped `email` over the raw profile's
 * (node_modules/better-auth/dist/plugins/generic-oauth/routes.mjs — `mapUser.email
 * ? ... : userInfo.email`), so the synthetic value is what gets persisted and
 * used as the unique key. (F2, upstream MPNext 7da14c5.)
 */
export function mapMpProfileToUser(profile: {
  userGuid?: unknown;
  mpUserId?: unknown;
  mpContactId?: unknown;
  email?: unknown;
}): Record<string, unknown> {
  // Throws rather than minting a session with an empty userGuid. Defense in
  // depth: unreachable while `getMpUserInfo` returns null for an unusable sub.
  const sub = typeof profile.userGuid === "string" ? profile.userGuid : "";
  if (!sub) {
    throw new Error("mapProfileToUser: MP profile has no usable sub");
  }
  return {
    userGuid: sub,
    mpUserId: profile.mpUserId,
    mpContactId: profile.mpContactId,
    // What better-auth stores as `email`. Never a real address.
    email: syntheticEmailForSub(sub),
    // The real MP address, or null when MP has none.
    mpEmail: typeof profile.email === "string" && profile.email ? profile.email : null,
  };
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  secret: betterAuthSecret,

  disabledPaths: disabledAuthPaths,

  // Send OAuth callback failures to our own page rather than better-auth's
  // built-in /api/auth/error, which the route allowlist no longer exposes.
  onAPIError: {
    errorURL: "/auth-error",
  },

  account: {
    // better-auth's OAuth callback first matches an account on
    // (providerId, sub). With no match it falls back to `findUserByEmail` and,
    // if both the stored user and the incoming profile are `emailVerified`,
    // links the new provider account onto the EXISTING user and issues a
    // session for that record. With one provider there is no legitimate
    // linking case, and MP does not make email unique — so the second person
    // signing in with a shared household address would have received the
    // first person's identity. (F2, upstream MPNext 85be4b3.)
    accountLinking: { enabled: false },
  },

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
          mapProfileToUser: (profile) => mapMpProfileToUser(profile),
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
