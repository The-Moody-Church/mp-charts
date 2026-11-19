/**
 * The /auth-error page's code table and echo rule, kept out of page.tsx so
 * page.test.tsx can import them (a page module may export only what Next
 * allows).
 */

/**
 * Error codes better-auth 1.7.18's core OAuth callback emits
 * (dist/oauth2/errors.mjs, api/routes/callback.mjs, oauth2/callback.mjs,
 * oauth2/state.mjs, oauth2/link-account.mjs), plus `sign_in_start_failed`, which is OURS
 * (src/components/sign-in/sign-in.tsx, when the flow cannot even start).
 * NOTE: `unable_to_get_user_info` covers several causes — getMpUserInfo
 * returning null (userinfo down, bad sub, id_token/userinfo sub mismatch) and
 * an empty account subject. The server log line tells them apart.
 */
export const ERROR_MESSAGES: Record<string, string> = {
  unable_to_get_user_info:
    "Ministry Platform signed you in, but we could not read a usable user record. Your account may be missing its User GUID, or Ministry Platform may be briefly unavailable.",
  sign_in_start_failed: "We could not start the Ministry Platform sign-in. Please try again in a minute.",
  oauth_provider_not_found: "Sign-in is temporarily unavailable. Please try again in a few minutes.",
  invalid_code:
    "We could not complete the sign-in with Ministry Platform. The sign-in link may have expired — please try again.",
  no_code: "The sign-in did not complete. Please start again.",
  nonce_binding_missing: "The sign-in did not complete. Please start again.",
  invalid_callback_request: "The sign-in response could not be read. Please try again.",
  state_not_found: "Your sign-in session expired before it completed. Please try again.",
  state_mismatch:
    "Your sign-in was started in another tab or window, or it expired. Please close other sign-in tabs and try again.",
  state_invalid: "Your sign-in session could not be verified. Please try again.",
  no_callback_url: "The sign-in did not know where to return you. Please start again.",
  issuer_mismatch:
    "The response did not come from the expected Ministry Platform server. Please contact your administrator.",
  email_not_found: "Ministry Platform did not return enough profile information to complete sign-in.",
  email_not_verified: "Ministry Platform has not verified this account's email address.",
  email_does_not_match: "This Ministry Platform account does not match the one you are signed in with.",
  account_not_linked:
    "This Ministry Platform account could not be matched to its record in this app. Please contact your administrator.",
  account_already_linked_to_different_user:
    "This Ministry Platform account is already linked to a different user in this app.",
  unable_to_link_account: "We could not link your Ministry Platform account. Please try signing in again.",
  unable_to_update_account: "We could not update your account record. Please try signing in again.",
  signup_disabled: "New accounts cannot be created in this app right now. Please contact your administrator.",
  unable_to_create_user: "We could not create your user record. Please try again.",
  unable_to_create_session: "We could not start your session. Please try again.",
  MISSING_FIELD:
    "Ministry Platform signed you in, but your account is missing a required identifier. Please contact your administrator.",
  access_denied: "Sign-in was cancelled.",
  internal_server_error: "Something went wrong while signing you in.",
};

/**
 * Shape of an error code worth echoing (upstream MPNext 6aa1633, adapted):
 * letters, digits and `_`, at most 64 characters. `?error=` is attacker
 * controlled: anyone can link here, or chain it through
 * `/signin?callbackUrl=/auth-error?error=...` so it lands after a genuine MP
 * login. Free text such as "Your account is locked. Call 555-0100" therefore
 * gets the fallback message and no echo, so this page cannot put arbitrary
 * prose on our own origin. Upper case is allowed, unlike upstream's
 * `/^[a-z0-9_]{1,64}$/`, because our own MISSING_FIELD is a key below; every
 * key of ERROR_MESSAGES matches (pinned by page.test.tsx). An unknown
 * well-formed code is still echoed, so a future better-auth code reaches
 * support.
 */
export const CODE_SHAPE = /^[A-Za-z0-9_]{1,64}$/;
