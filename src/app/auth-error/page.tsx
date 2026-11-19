import { Suspense } from "react";
import Link from "next/link";
import { CODE_SHAPE, ERROR_MESSAGES } from "./error-codes";

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

const FALLBACK_MESSAGE =
  "We could not complete your Ministry Platform sign-in. Please try again.";

type Props = { searchParams: Promise<{ error?: string | string[] }> };

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
  //
  // `error` is untrusted query input. It is used only if it is ONE string of
  // the code shape: a repeated `?error=a&error=b` arrives as an array, and
  // free text is a phishing aid on our own origin (CODE_SHAPE above). The
  // same validated value drives both the lookup and the echo.
  const code = typeof error === "string" && CODE_SHAPE.test(error) ? error : undefined;

  // ERROR_MESSAGES is a plain object, so only OWN keys are looked up:
  // `?error=__proto__` (which matches CODE_SHAPE) would otherwise resolve to
  // Object.prototype (render throws) and `?error=constructor` to a function
  // (empty message, fallback skipped). Pinned by page.test.tsx.
  const message =
    (code && Object.hasOwn(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : undefined) ||
    FALLBACK_MESSAGE;

  return <AuthErrorShell message={message} code={code} />;
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
