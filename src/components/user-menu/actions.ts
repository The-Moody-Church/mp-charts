'use server';

import { auth } from "@/lib/auth";
import { buildEndSessionUrl, MP_PROVIDER_ID } from "@/lib/auth-endsession";
import { logError } from "@/lib/logger";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Reads the OIDC ID token from the signed-in user's Ministry Platform account.
 *
 * Needed as `id_token_hint` on the end-session request; see
 * `src/lib/auth-endsession.ts` for why that parameter is load-bearing.
 *
 * NEVER THROWS. Sign-out must not depend on this succeeding. This app uses
 * better-auth's in-memory adapter, so a session that predates a container
 * restart has no stored account to read, and that is a normal state rather
 * than an error. Returning null degrades to the previous behaviour: still
 * signed out, just left on MP's page instead of returned here.
 *
 * The token is deliberately not logged. It is a JWT full of user claims.
 */
async function findMpIdToken(requestHeaders: Headers): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: requestHeaders });
    const userId = session?.user?.id;
    if (!userId) return warnNoHint("no-session");

    const ctx = await auth.$context;
    const accounts = await ctx.internalAdapter.findAccountByUserId(userId);
    const mpAccount = accounts?.find((a) => a.providerId === MP_PROVIDER_ID);
    if (!mpAccount) return warnNoHint("no-mp-account");
    if (!mpAccount.idToken) return warnNoHint("account-has-no-id-token");

    return mpAccount.idToken;
  } catch (error) {
    logError("signout.idToken.lookup", error);
    return null;
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
 * says which of the three ways it failed.
 *
 * Deliberately carries no user identifier and never the token itself.
 */
function warnNoHint(reason: "no-session" | "no-mp-account" | "account-has-no-id-token"): null {
  console.warn(
    `[signout] id_token_hint omitted (${reason}) — MP will ignore post_logout_redirect_uri ` +
      `and leave the user on its logged-out page. See docs/OAUTH_LOGOUT_SETUP.md.`
  );
  return null;
}

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
