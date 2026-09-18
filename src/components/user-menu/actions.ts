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
    if (!userId) return null;

    const ctx = await auth.$context;
    const accounts = await ctx.internalAdapter.findAccountByUserId(userId);
    const mpAccount = accounts?.find((a) => a.providerId === MP_PROVIDER_ID);
    return mpAccount?.idToken ?? null;
  } catch (error) {
    logError("signout.idToken.lookup", error);
    return null;
  }
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
