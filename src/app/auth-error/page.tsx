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
 * Error codes emitted by better-auth 1.6's genericOAuth callback
 * (node_modules/better-auth/dist/plugins/generic-oauth/routes.mjs) and its
 * shared OAuth helpers. These are the 1.6 names — upstream MPNext is on 1.7,
 * where several were renamed (e.g. `user_info_is_missing` became
 * `unable_to_get_user_info`). Revisit during the 1.7 migration.
 */
const ERROR_MESSAGES: Record<string, string> = {
  user_info_is_missing:
    "Ministry Platform signed you in, but did not return a usable user record. Your account may be missing its User GUID.",
  id_is_missing:
    "Ministry Platform did not return an account identifier, so we could not establish who you are.",
  email_is_missing:
    "Ministry Platform did not return enough profile information to complete sign-in.",
  account_already_linked_to_different_user:
    "This Ministry Platform account is already linked to a different user in this app.",
  unable_to_link_account:
    "We could not link your Ministry Platform account. Please try signing in again.",
  invalid_code: "The sign-in link has already been used or is no longer valid.",
  oAuth_code_missing: "The sign-in did not complete. Please start again.",
  no_code: "The sign-in did not complete. Please start again.",
  oauth_code_verification_failed:
    "We could not verify the response from Ministry Platform. This usually means the sign-in took too long — please try again.",
  invalid_callback_request: "The sign-in response could not be read. Please try again.",
  issuer_mismatch:
    "The response did not come from the expected Ministry Platform server. Please contact your administrator.",
  issuer_missing:
    "Ministry Platform's sign-in configuration could not be read. Please try again shortly.",
  state_not_found: "Your sign-in session expired before it completed. Please try again.",
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
