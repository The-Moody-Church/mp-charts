import { Suspense } from "react";
import Link from "next/link";

/**
 * Landing page for a failed Ministry Platform OAuth callback.
 *
 * `onAPIError.errorURL` in @/lib/auth points better-auth here, replacing its
 * built-in /api/auth/error page (which the route allowlist no longer exposes).
 *
 * Like /session-error, this lives OUTSIDE the (web) route group so it is not
 * wrapped by AuthWrapper — the visitor has no session by definition, and being
 * bounced to /signin would auto-start OAuth again and loop forever.
 * src/proxy.ts allowlists this path for the same reason.
 *
 * (F7, upstream MPNext 91d226f.)
 */

/**
 * Error codes better-auth 1.7.5's core OAuth callback emits
 * (dist/oauth2/errors.mjs, api/routes/callback.mjs, oauth2/state.mjs,
 * oauth2/link-account.mjs), plus `sign_in_start_failed`, which is OURS
 * (src/components/sign-in/sign-in.tsx, when the flow cannot even start).
 * NOTE: `unable_to_get_user_info` covers several causes — getMpUserInfo
 * returning null (userinfo down, bad sub, id_token/userinfo sub mismatch) and
 * an empty account subject. The server log line tells them apart.
 */
const ERROR_MESSAGES: Record<string, string> = {
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

const FALLBACK_MESSAGE =
  "We could not complete your Ministry Platform sign-in. Please try again.";

type Props = { searchParams: Promise<{ error?: string }> };

/**
 * Sync wrapper so the shell prerenders. `cacheComponents` is on in this repo,
 * so reading `searchParams` outside a Suspense boundary fails the build
 * ("uncached or runtime data during prerendering") — see
 * .claude/rules/caching.md § Suspense & PPR Pattern for Pages.
 */
export default function AuthErrorPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<AuthErrorShell message={FALLBACK_MESSAGE} />}>
      <AuthErrorContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AuthErrorContent({ searchParams }: Props) {
  const { error } = await searchParams;

  // NOTE: `error_description` is deliberately NOT read or rendered. It is
  // attacker- and provider-controlled text reflected into the query string;
  // showing it would let a crafted /auth-error link display arbitrary content
  // on our own domain.
  //
  // Precisely what that does and does not guarantee, verified live against a
  // soak build 2026-09-17: the value never reaches the RENDERED page. It does
  // still appear in Next's RSC flight payload, because Next serializes every
  // page's searchParams into the document regardless of which ones a
  // component reads — that is framework behaviour and no code here can
  // prevent it. It is safe: Next escapes `<`/`>` to \u003c/\u003e inside
  // that payload, so a `</script><script>` breakout attempt is inert (tested
  // directly; script tags stayed balanced). So the guarantee is "not rendered
  // and not executable", not "absent from the response".
  const message = (error && ERROR_MESSAGES[error]) || FALLBACK_MESSAGE;

  return <AuthErrorShell message={message} code={error} />;
}

function AuthErrorShell({ message, code }: { message: string; code?: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold mb-3">We couldn&apos;t sign you in</h1>
        <p className="text-gray-600 mb-6">{message}</p>
        <p className="text-gray-600 mb-6">
          If this keeps happening, contact your administrator
          {code ? (
            <>
              {" "}
              and mention the code <code className="font-mono text-sm">{code}</code>
            </>
          ) : null}
          .
        </p>
        {/* No auto-redirect: a failing OAuth loop has to land somewhere stable. */}
        <Link
          href="/signin"
          className="inline-flex items-center justify-center rounded-md bg-[#344767] px-5 py-2.5 text-white font-medium hover:bg-[#2d3a5f] focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          Try signing in again
        </Link>
      </div>
    </div>
  );
}
