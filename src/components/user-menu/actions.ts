'use server';

import { auth } from "@/lib/auth";
import { buildEndSessionUrl, MP_PROVIDER_ID } from "@/lib/auth-endsession";
import { takeIdToken } from "@/lib/id-token-store";
import { logError } from "@/lib/logger";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Finds the signed-in user's OIDC ID token, for `id_token_hint` on the
 * end-session request. See `src/lib/auth-endsession.ts` for why that parameter
 * is load-bearing.
 *
 * NEVER THROWS. Sign-out must not depend on this succeeding. Normal states that
 * leave it with nothing to send, none of them an error:
 *
 *   - a session that predates a container restart: the token store and the
 *     in-memory account row are both gone;
 *   - `no-session`: the session is gone (expired, or a restart after the
 *     one-hour cookie cache lapsed). Since the auth instance is shared per
 *     process (`sharedInstance` in src/lib/auth.ts), this action reads the
 *     same store as the route handler, so a lapsed cookie cache alone no
 *     longer causes it;
 *   - `/session-error`: its session has no `userGuid` to key the store by, and
 *     usually no MP account row, so it signs out without the hint.
 *
 * Returning null degrades to signing out without the hint: still signed out,
 * just left on MP's page instead of returned here.
 *
 * The token is deliberately not logged. It is a JWT full of user claims.
 */
async function findMpIdToken(requestHeaders: Headers): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session?.user) return warnNoHint("no-session");

    // PRIMARY: the process-wide store, written at sign-in.
    //
    // The account lookup below was the original implementation and it
    // returned nothing on a real sign-out while each Next bundle layer had its
    // own auth instance and in-memory adapter. See src/lib/id-token-store.ts.
    const userGuid = (session.user as { userGuid?: unknown }).userGuid;
    const stored = takeIdToken(typeof userGuid === "string" ? userGuid : null);
    if (stored) return stored;

    // FALLBACK: the account record, in the shared in-memory adapter. It works
    // now that the auth instance is shared per process, and the row keeps its
    // idToken (only the access/refresh tokens are stripped before it is
    // stored — see `stripUserOAuthTokens` in src/lib/auth.ts).
    const userId = session.user.id;
    if (!userId) return warnNoHint("no-session");

    const ctx = await auth.$context;
    const accounts = await ctx.internalAdapter.findAccountByUserId(userId);
    const mpAccount = accounts?.find((a) => a.providerId === MP_PROVIDER_ID);
    if (!mpAccount) return warnNoHint("no-mp-account");
    if (!mpAccount.idToken) return warnNoHint("account-has-no-id-token");

    return mpAccount.idToken;
  } catch (error) {
    logError("signout.idToken.lookup", error);
    // The same line as every other no-hint path, so "no such line in the log"
    // really does mean the hint was sent.
    return warnNoHint("lookup-failed");
  }
}

/**
 * Says why sign-out could not include `id_token_hint`, and returns null.
 *
 * This is a WARNING rather than information because the consequence is real
 * and otherwise invisible: without the hint, MP discards
 * `post_logout_redirect_uri` and leaves the user on its own logged-out page.
 * Sign-out still works, so nothing else would tell you.
 *
 * It exists to make one sign-out decide a question that otherwise takes
 * guesswork: if this line does NOT appear, the app did its part and any
 * remaining problem is MP-side registration. If it DOES appear, the reason
 * says which way it failed. Every path that returns no token goes through
 * here, the catch included, so the absence of the line is conclusive.
 *
 * Deliberately carries no user identifier and never the token itself.
 */
function warnNoHint(
  reason: "no-session" | "no-mp-account" | "account-has-no-id-token" | "lookup-failed"
): null {
  console.warn(
    `[signout] id_token_hint omitted (${reason}) — MP will ignore post_logout_redirect_uri ` +
      `and leave the user on its logged-out page. See docs/OAUTH_LOGOUT_SETUP.md.`
  );
  return null;
}

/**
 * Signs the user out of this app and then out of Ministry Platform.
 *
 * Callers: the user menu, which still refreshes the session cookie cache
 * through `GET /api/auth/get-session` first (`refreshSessionCookie` in
 * `user-menu.tsx` — a cheap backup, no longer required: this action reads the
 * shared store once the cache has lapsed), and `/session-error` (see
 * `findMpIdToken`).
 */
export async function handleSignOut() {
  const requestHeaders = await headers();

  // 1. Read the hint while the session still exists. ORDER MATTERS: the
  //    session is how the user is identified, and signing out destroys it.
  const idToken = await findMpIdToken(requestHeaders);

  // 2. Clear this app's session.
  await auth.api.signOut({ headers: requestHeaders });

  const baseUrl = process.env.MINISTRY_PLATFORM_BASE_URL;
  if (!baseUrl) {
    throw new Error('MINISTRY_PLATFORM_BASE_URL is not configured');
  }

  // 3. Hand the browser to MP, the only thing that can end the IdP session.
  //    `redirect()` throws NEXT_REDIRECT, so it must stay outside any catch.
  redirect(
    buildEndSessionUrl({
      baseUrl,
      postLogoutUri: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
      idToken,
      clientId: process.env.OIDC_CLIENT_ID,
    })
  );
}
