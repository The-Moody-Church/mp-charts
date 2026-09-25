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
 * NEVER THROWS. Sign-out must not depend on this succeeding. Two normal states
 * leave it with nothing to send, and neither is an error:
 *
 *   - a session that predates a container restart: the token store is empty;
 *   - `no-session` once the one-hour JWT cookie cache has lapsed. This server
 *     action can read the session ONLY from that cookie, because its own
 *     in-memory adapter is a different, empty instance from the route
 *     handler's (see `src/lib/id-token-store.ts`). The user menu therefore
 *     calls `GET /api/auth/get-session` first, which runs in the route handler
 *     and re-issues the cookie. `/session-error` posts straight here with no
 *     such refresh, and its session has no `userGuid` to key the store by
 *     anyway, so it signs out without the hint.
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
    // This is not a cache in front of the account record — it is the only
    // thing that works. The account lookup below was the original
    // implementation and it returned nothing on a real sign-out, because the
    // session is a cookie-carried JWT while accounts live in a per-module
    // in-memory adapter. See src/lib/id-token-store.ts.
    const userGuid = (session.user as { userGuid?: unknown }).userGuid;
    const stored = takeIdToken(typeof userGuid === "string" ? userGuid : null);
    if (stored) return stored;

    // FALLBACK: the account record. Kept because it costs nothing, is correct
    // when it does work, and would start working on its own if this app ever
    // gains a real database.
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
 * Callers: the user menu, which refreshes the session cookie cache through
 * `GET /api/auth/get-session` immediately before calling this (see
 * `refreshSessionCookie` in `user-menu.tsx` — without it, a cache older than
 * an hour costs the `id_token_hint`), and `/session-error`, which cannot
 * benefit from that refresh (see `findMpIdToken`).
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
    })
  );
}
