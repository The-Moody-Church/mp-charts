/**
 * Building the Ministry Platform end-session URL.
 *
 * Kept separate from the sign-out action so it can be tested without mocking
 * better-auth, and so the `id_token_hint` rule below is stated once.
 */

/** The genericOAuth provider id this app registers in `src/lib/auth.ts`. */
export const MP_PROVIDER_ID = "ministryplatform";

export interface EndSessionParams {
  /** `MINISTRY_PLATFORM_BASE_URL`. Already includes the `/ministryplatformapi` segment. */
  baseUrl: string;
  /** Where MP should send the browser afterwards. Normally `BETTER_AUTH_URL`. */
  postLogoutUri: string;
  /**
   * The OIDC ID token from the user's MP account record, or null if it could
   * not be read.
   */
  idToken?: string | null;
}

/**
 * Builds the URL that terminates the Ministry Platform session.
 *
 * WHY `id_token_hint` IS NOT OPTIONAL IN PRACTICE
 *
 * MP runs IdentityServer, which honours `post_logout_redirect_uri` ONLY when
 * `id_token_hint` is also present. The hint is what identifies the client, and
 * without knowing the client the server cannot check the URI against that
 * client's registered list — so it discards the parameter and shows its own
 * logged-out page instead.
 *
 * That was the observed behaviour before this was added, on all four sibling
 * apps: sign-out worked, the session was genuinely terminated, but the user was
 * left stranded on MP's site with no way back. MP's logout page was serving
 * `window.returnUrl = ""`, which is the tell — that page is built to bounce the
 * browser back and had nothing to bounce to.
 *
 * SECOND REQUIREMENT, OUTSIDE THIS CODE: `postLogoutUri` must also be
 * registered against this app's MP OAuth client. The hint alone is not enough.
 * MP does not expose client registration through its REST API, so that is an
 * administrator task and cannot be asserted here.
 *
 * WHEN THE HINT IS MISSING we still return a valid URL. Sign-out must never
 * depend on it: these apps use better-auth's in-memory adapter, so a session
 * that predates a container restart has no stored token to read. The user then
 * gets the old behaviour — signed out correctly, left on MP's page — which is
 * strictly better than failing to sign out at all.
 *
 * NOTE the hint is a JWT carried as a query parameter, which is what the OIDC
 * spec prescribes for this endpoint. It is an identity assertion, not a bearer
 * credential for MP's API, and it is being sent to the issuer that minted it.
 * Do not log it, and do not reuse this pattern for access or refresh tokens.
 */
export function buildEndSessionUrl({
  baseUrl,
  postLogoutUri,
  idToken = null,
}: EndSessionParams): string {
  const params = new URLSearchParams({ post_logout_redirect_uri: postLogoutUri });
  if (idToken) {
    params.set("id_token_hint", idToken);
  }
  // `baseUrl` already ends in `/ministryplatformapi`; this matches the
  // `end_session_endpoint` advertised in MP's discovery document exactly.
  return `${baseUrl.replace(/\/+$/, "")}/oauth/connect/endsession?${params.toString()}`;
}
