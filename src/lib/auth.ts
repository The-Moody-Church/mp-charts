import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, customSession } from "better-auth/plugins";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { MPHelper } from "@/lib/providers/ministry-platform";
import type { MPUserProfile } from "@/lib/providers/ministry-platform/types";
import { sanitizeGuid } from "@/lib/providers/ministry-platform/utils/filter-sanitize";
import { rememberIdToken } from "@/lib/id-token-store";
import { MP_PROVIDER_ID } from "@/lib/auth-endsession";

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
 *
 * NEVER THROWS. better-auth 1.7.5 still calls `getUserInfo` without a
 * try/catch (dist/api/routes/callback.mjs:122), so a throw becomes a bare
 * HTTP 500 on the callback. A null return becomes the clean
 * /auth-error?error=unable_to_get_user_info redirect instead.
 */
export async function getMpUserInfo(accessToken: string | undefined) {
  let response: Response;
  try {
    response = await fetch(`${mpOauthUrl}/connect/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    console.error(JSON.stringify({ event: "auth.userinfo.fetch_failed" }));
    return null;
  }

  if (!response.ok) {
    console.error(
      JSON.stringify({ event: "auth.userinfo.http_error", status: response.status })
    );
    return null;
  }

  // A 200 whose body is not JSON (an HTML maintenance page, say) must not throw
  // either — see NEVER THROWS above.
  // Untrusted until sanitizeGuid below validates `sub`.
  let profile: { sub?: string; email?: string; email_verified?: unknown; given_name?: string; family_name?: string };
  try {
    profile = await response.json();
  } catch {
    console.error(JSON.stringify({ event: "auth.userinfo.bad_body" }));
    return null;
  }

  // Refuse an unusable subject by returning null, NOT by throwing — see the
  // NEVER THROWS note above: null is the clean `unable_to_get_user_info`
  // redirect, a throw is a bare 500. (Upstream MPNext 7da14c5.)
  let validGuid: string;
  try {
    validGuid = sanitizeGuid(profile.sub ?? "");
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
    // better-auth 1.7 builds the account key from THIS raw object, never from
    // mapProfileToUser. `sub` is what an OIDC-discovery provider reads, `id` is
    // what a plain-OAuth provider reads (generic-oauth/index.mjs:146), and
    // `accountSubject` below reads `sub` explicitly. All three are the
    // sanitizeGuid-validated value — NEVER the raw profile.sub. tsc cannot
    // enforce this (`sub?` is optional in GenericOAuthUserInfo); auth.test.ts does.
    id: validGuid,
    sub: validGuid,
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
 * The `sub` claim of an ID token, decoded WITHOUT verification.
 *
 * Used only as a consistency check against userinfo's `sub` (see getUserInfo
 * below). Safe as such: in the code flow the token arrives directly from MP's
 * token endpoint over TLS, and if discovery is ever re-enabled better-auth
 * has already verified the token against MP's JWKS before our getUserInfo runs
 * (generic-oauth/index.mjs:221-226).
 */
export function idTokenSubject(idToken: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")
    );
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
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
 * form). Since better-auth 1.6, `parseAdditionalUserInputFromProviderProfile`
 * (better-auth/dist/db/schema — `if (schema[key]?.input === false) continue;`;
 * byte-identical in 1.7) strips any additional field declared with
 * `input: false` BEFORE the user record is created. With `input: false`:
 *   - `userGuid` is dropped -> every MP profile lookup breaks (blank avatar,
 *     dead user menu, `userId: null`, and the session gets trapped — see the
 *     /session-error recovery route in AuthWrapper).
 *   - `mpUserId` is dropped -> audit attribution (`$userId`) on MP writes breaks.
 *   - `mpContactId` is dropped -> contact-scoped lookups break.
 *   - `mpEmail` is dropped -> the real address is lost; the UI falls back.
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
 * `input: false` is NOT an alternative — in better-auth 1.6 and 1.7 that one flag
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
 * Platform address to `mpEmail`. better-auth 1.7 builds the user as
 * `{ email: raw.email, ..., ...mapped }`
 * (node_modules/better-auth/dist/plugins/generic-oauth/index.mjs), so the
 * mapped synthetic value wins and is what gets persisted and used as the
 * unique key. In 1.7 this mapping is also the ONLY carrier of the four
 * additional fields — the raw profile is no longer spread into the user.
 * (F2, upstream MPNext 7da14c5.)
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

/**
 * Blanks the user's MP access and refresh tokens (and their expiries) on an
 * account row before better-auth stores it; everything else, the idToken
 * included, passes through. Returns a copy. Exported for tests.
 */
export function stripUserOAuthTokens<T extends object>(account: T): T {
  return {
    ...account,
    accessToken: null,
    refreshToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
  };
}

/**
 * Session lifetime (upstream MPNext fd7fc4a, measured on our build 2026-09-29).
 *
 * There is no database: the signed `session_token` + `session_data` cookies
 * ARE the session, backed only by the in-memory adapter of the one shared
 * `auth` instance below. Sign-out can delete that row, but it cannot recall a
 * cookie pair someone already copied, so these settings put a hard ceiling on
 * how long any session — including a copied pair — can live:
 *
 * - `expiresIn: 12h` — `expiresAt` is set once, at sign-in. Both
 *   `/get-session` paths refuse a session past it, and it is the
 *   `session_token` cookie's Max-Age. better-auth's default is 7 days. It
 *   matches `MAX_AGE_MS` in src/lib/id-token-store.ts, so a live session
 *   always still has its `id_token_hint`.
 * - `disableSessionRefresh: true` — without it the in-memory path slides
 *   `expiresAt` forward another `expiresIn` once per `updateAge` (1 day). With
 *   the 7-day default, a `session_token` replayed once a day lived until the
 *   container restarted. (`updateAge` is left at its default: with refresh
 *   disabled nothing reads it.)
 * - `cookieCache.refreshCache: false` — MUST be explicit. With no database
 *   better-auth defu-merges `refreshCache: true` UNDER this config
 *   (node_modules/better-auth/dist/context/create-context.mjs), which re-signs
 *   `session_data` from the cookie alone — no store lookup — in the last 20%
 *   of `maxAge`, until `expiresAt`. `false` bounds a pair with no live row
 *   (copied before sign-out, or minted before a restart) to `maxAge` (1h)
 *   after it was minted; after that `/get-session` asks the store, which
 *   re-mints only if the row still exists.
 *
 * What users see: a session is re-checked against the store at least hourly
 * and ends 12h after sign-in however active it is; the next page load then
 * goes back through MP sign-in, which is silent while their MP session is
 * alive. After a restart the store is empty, so every session ends within 1h
 * (when its cookie cache lapses).
 *
 * Pinned by src/lib/auth.session-lifetime.test.ts. Emergency "sign everyone
 * out": rotate BETTER_AUTH_SECRET (or add `cookieCache.version` and bump it).
 */
export const SESSION_EXPIRES_IN_SECONDS = 12 * 60 * 60;
export const SESSION_COOKIE_CACHE_MAX_AGE_SECONDS = 60 * 60;

function createAuth() {
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
    secret: betterAuthSecret,

    disabledPaths: disabledAuthPaths,

    // Send OAuth callback failures to our own page rather than better-auth's
    // built-in /api/auth/error, which the route allowlist no longer exposes.
    onAPIError: {
      errorURL: "/auth-error",
    },

    /**
     * Refuse better-auth 1.7's direct ID-token sign-in on /sign-in/social.
     *
     * That branch (dist/api/routes/sign-in.mjs:153-217) mints a session from a
     * client-POSTed `idToken` with no state, no code and no redirect, and takes
     * identity from userinfo called with the CALLER-SUPPLIED access token. With
     * no discoveryUrl it is already closed (ID_TOKEN_NOT_SUPPORTED); this makes
     * it stay closed if discovery is ever re-added, and covers in-process
     * auth.api.signInSocial callers that the route.ts body filter does not see.
     * Second layer; route.ts is the first. genericOAuth offers no switch for it.
     */
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path === "/sign-in/social" &&
          ctx.body &&
          typeof ctx.body === "object" &&
          "idToken" in ctx.body
        ) {
          throw APIError.from("NOT_FOUND", {
            code: "ID_TOKEN_SIGN_IN_DISABLED",
            message: "Not Found",
          });
        }
      }),
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
      // The user's own MP tokens are never used after sign-in: every MP data
      // call goes through the client-credentials service account
      // (src/lib/providers/ministry-platform/auth/), and no caller passes a
      // user token to a service. better-auth defaults this to `true` when
      // there is no database, which put the user's MP access and id tokens
      // into an encrypted `account_data` cookie on every response. Nothing the
      // route allowlist exposes reads that cookie, so keep them out of the
      // browser. (Upstream MPNext a424953.)
      storeAccountCookie: false,
    },

    // Keep the user's MP access/refresh tokens out of the in-memory adapter
    // too (plaintext until restart; a heap dump would hand over every
    // signed-in user's MP API rights). `getUserInfo` has already used the
    // access token by the time the account row is written. The idToken is
    // KEPT: it is not an API bearer, and sign-out's account-row fallback
    // (findMpIdToken in src/components/user-menu/actions.ts) sends it as
    // `id_token_hint`. (Upstream MPNext a424953.)
    databaseHooks: {
      account: {
        create: { before: async (account) => ({ data: stripUserOAuthTokens(account) }) },
        update: { before: async (account) => ({ data: stripUserOAuthTokens(account) }) },
      },
    },

    session: {
      // See SESSION_EXPIRES_IN_SECONDS above for why each of these is set.
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      disableSessionRefresh: true,
      cookieCache: {
        enabled: true,
        maxAge: SESSION_COOKIE_CACHE_MAX_AGE_SECONDS,
        strategy: "jwt",
        refreshCache: false,
      },
    },

    user: {
      additionalFields: userAdditionalFields,
    },

    plugins: [
      genericOAuth({
        config: [
          {
            providerId: MP_PROVIDER_ID,
            // NO discoveryUrl — deliberate (1.7 migration, see the 2026-09-24 entry
            // in .claude/notes/upstream-sync-log.md).
            // better-auth 1.7 fetches discovery ONCE, eagerly, when this module
            // loads, with no timeout: a slow MP stalls every auth call on the
            // container, and a failed fetch drops the provider until restart.
            // With discovery it would also JWKS-verify the id_token with zero
            // clock tolerance and open the /sign-in/social idToken branch.
            // Explicit endpoints give exactly 1.6's posture (1.6 never verified
            // the id_token); identity comes from /connect/userinfo. Values are
            // MP's discovery document's, verbatim.
            authorizationUrl: `${mpOauthUrl}/connect/authorize`,
            tokenUrl: `${mpOauthUrl}/connect/token`,
            userInfoUrl: `${mpOauthUrl}/connect/userinfo`,
            // The sign-in client is OIDC_CLIENT_ID = TM.Widgets in every
            // environment (NOT MPNext, which is the server-to-server client).
            clientId: process.env.OIDC_CLIENT_ID!,
            clientSecret: process.env.OIDC_CLIENT_SECRET!,
            // NO `offline_access`. It was requested until 2026-09-22 and the
            // refresh token it bought was never used once.
            //
            // What it cost, as read off the `MPNext` client configuration in MP:
            // refresh token lifetime 43200 minutes — 30 days — with rotation
            // OFF. So every sign-in minted a static 30-day credential that sat
            // in memory and was never redeemed. (Sign-in actually runs on the
            // TM.Widgets client — OIDC_CLIENT_ID — whose refresh-token settings
            // have not been read. The scope is gone either way.)
            //
            // Verified unused on three independent grounds before removing it:
            //   - zero references to refresh tokens anywhere in src/, all four apps;
            //   - better-auth only refreshes from `/get-access-token` or
            //     `/refresh-token`, and neither is on the deny-by-default
            //     allowlist in src/app/api/auth/[...all]/route.ts, so both 404
            //     before reaching better-auth;
            //   - server-to-server MP calls use a SEPARATE client_credentials
            //     token (src/lib/providers/ministry-platform/auth/), not the
            //     user's.
            //
            // The user's tokens are used once, during sign-in, to read
            // /connect/userinfo and dp_Users. Nothing needs them afterwards.
            //
            // DO NOT re-add this scope to "be safe". If something later genuinely
            // needs to act as the user after sign-in, add it deliberately, and
            // note that MP does not rotate these — a leaked one is good for 30
            // days.
            scopes: ["openid", "http://www.thinkministry.com/dataplatform/scopes/all"],
            // PKCE is OFF because MP's TM.Widgets client rejects it at token
            // exchange (invalid_grant; re-tested 2026-09-22 on the production
            // music-tools :dev slot). better-auth 1.7 DEFAULTS PKCE ON
            // (`c.pkce ?? true`, generic-oauth/index.mjs:181,206): deleting this
            // line as "redundant" breaks sign-in on every app, and on 1.7 the
            // failure surfaces as /auth-error?error=invalid_code (it was
            // oauth_code_verification_failed on 1.6). Pinned by auth.test.ts.
            //
            // Re-tested 2026-09-22 and the result was a clean negative. Do not
            // flip this without reading the rest of this comment.
            //
            // WHAT WAS RULED OUT, so nobody repeats the investigation:
            //
            //   - MP supports PKCE at the server level. Its discovery document
            //     advertises `code_challenge_methods_supported: ['plain','S256']`.
            //   - MP's AUTHORIZE endpoint accepts a real S256 challenge. Probed
            //     directly: it returns the same 302 to the login page as a
            //     request without one, not an error. The front channel is fine.
            //   - better-auth carries the verifier correctly. With no database
            //     (1.6 and 1.7 alike) `generateState` stores it in the encrypted
            //     `oauth_state` cookie beside the state nonce; the `state` query
            //     parameter is only that random nonce. It round-trips with the
            //     browser and is never lost server-side.
            //
            // WHAT FAILS: the token exchange, every time.
            //
            //     ERROR [Better Auth]: { error: 'invalid_grant', status: 400 }
            //
            // Three attempts, three identical failures, and the user landed on
            // /auth-error with `oauth_code_verification_failed`.
            //
            // CONCLUSION, sharper than the 2026-04-20 revert could manage: this
            // is not "MP may not support PKCE". MP does. The `TM.Widgets` OAuth
            // client — the sign-in client shared by all four of these apps
            // (earlier notes said `MPNext`; that is only the server-to-server
            // client) — is not configured to accept a code challenge, and that
            // configuration is not reachable through MP's REST API.
            //
            // WHEN TO REVISIT: only after an MP administrator enables PKCE on the
            // `TM.Widgets` client. Until then this flag fails the same way every
            // time and breaks sign-in for every app at once.
            //
            // WORTH KEEPING IN PROPORTION: this client is CONFIDENTIAL and holds
            // a secret, so the authorization code is already protected. PKCE here
            // is defence in depth against code interception, not a missing
            // control. It is not worth a login outage.
            pkce: false,
            // MP omits `nonce` from its id_token (upstream MPNext f88a9f1, decoded
            // from a real token). Inert while there is no discoveryUrl; here so
            // re-adding discovery cannot silently break sign-in. Pinned by test.
            disableIdTokenNonceBinding: true,
            // Sign-out stays hand-built (user-menu/actions.ts + id-token-store):
            // with explicit endpoints there is no end_session_endpoint for
            // better-auth to use, and its URL would normalise
            // post_logout_redirect_uri away from the value registered in MP.
            disableProviderLogout: true,
            // Identity is the validated MP User_GUID, independent of whether a
            // discovery document was ever fetched.
            accountSubject: ({ profile }) => (typeof profile.sub === "string" ? profile.sub : ""),
            getUserInfo: async (tokens) => {
              const profile = await getMpUserInfo(tokens.accessToken);
              if (!profile) return null;
              // Bind the ID token to the userinfo identity (OIDC Core §5.3.2).
              // Refuses a token pair belonging to two different people.
              if (tokens.idToken) {
                const idSub = idTokenSubject(tokens.idToken);
                if (!idSub || idSub.toLowerCase() !== profile.sub.toLowerCase()) {
                  console.error(JSON.stringify({ event: "auth.userinfo.sub_mismatch" }));
                  return null;
                }
              }
              // Keep the ID token for sign-out, which needs it as `id_token_hint`
              // or MP discards `post_logout_redirect_uri` and strands the user on
              // its logged-out page. Captured HERE rather than inside
              // `getMpUserInfo`, which only receives the access token. Sign-out
              // reads this store first and the account record second — see
              // src/lib/id-token-store.ts for why the account record alone was
              // not enough before the auth instance was shared.
              rememberIdToken(profile.userGuid, tokens.idToken);
              return profile;
            },
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
}

/**
 * globalThis key holding the process-wide auth instance. `Symbol.for`, so every
 * module copy (and every test) resolves the same key. Exported for tests.
 */
export const SHARED_AUTH_KEY = Symbol.for("tmc.auth");

/**
 * Returns the one `auth` for this process, creating it on first use
 * (upstream MPNext 0e2652e).
 *
 * Next loads this module once PER BUNDLE LAYER. Measured 2026-09-29 on a
 * standalone production build of this app: the `/api/auth` route handler gets
 * one copy, server components and server actions share a second. Each copy
 * built its own betterAuth() with its own in-memory store, so the OAuth
 * callback wrote the session and account rows in the route handler's store
 * while `handleSignOut` deleted from the other, empty one. Sign-out then
 * removed nothing `/get-session` reads: a `session_token` copied before
 * sign-out stayed valid (to the 7-day default, sliding daily) until the
 * container restarted. It also meant server components and server actions
 * could see the session ONLY through the one-hour cookie cache.
 *
 * Caching on globalThis gives every layer one instance and one store — the
 * same pattern as `serviceCache` and the id-token store. It is still per
 * PROCESS: a restart empties it, as before.
 *
 * Vitest is exempt (it re-imports the module to rebuild the instance under a
 * different environment); src/lib/auth.shared-instance.test.ts clears `VITEST`
 * to exercise the real path. Under `next dev`, edits to the auth options take
 * effect after a dev-server restart, not on hot reload — the old instance is
 * still on globalThis.
 */
export function sharedInstance<T>(
  key: symbol,
  create: () => T,
  env: Readonly<Record<string, string | undefined>> = process.env,
): T {
  if (env.VITEST) return create();
  const store = globalThis as unknown as Record<symbol, T | undefined>;
  return (store[key] ??= create());
}

export const auth = sharedInstance(SHARED_AUTH_KEY, createAuth);

export type Session = typeof auth.$Infer.Session;
