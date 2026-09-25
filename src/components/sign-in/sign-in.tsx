"use client";

/**
 * The sign-in page body.
 *
 * This lives in a component, not in `src/app/signin/page.tsx`, for one
 * specific reason: **route segment config is IGNORED in a module marked
 * `"use client"`.** An `export const dynamic` sitting in the old client page
 * was inert, and the build output still reported `/signin` as static (`○`).
 *
 * That matters once a nonce-based CSP lands. Next reads the nonce off the
 * INCOMING REQUEST, so a prerendered page has no nonce, its bootstrap script
 * is blocked under an enforced policy, and it never hydrates. This page does
 * nothing BUT run client-side effects to start the Ministry Platform OAuth
 * flow — so an unhydrated /signin is a permanent spinner that never reaches
 * MP. On the one page nobody can route around.
 *
 * So the route file is now a server component that CAN opt out, and this is
 * the client half. `src/app/signin/page.test.tsx` pins both halves, because
 * either one silently reverts the fix.
 */

import { useEffect, useRef, Suspense } from "react";
import { authClient } from "@/lib/auth-client";
import { MP_PROVIDER_ID } from "@/lib/auth-endsession";
import { useSearchParams } from "next/navigation";

/** Exported for src/components/sign-in/safe-callback-url.test.ts. */
export function getSafeCallbackUrl(url: string | null): string {
  if (!url) return "/";
  // Reject backslashes and control characters first. Browsers normalize "\" to "/",
  // so a value like "/\evil.com" would slip past naive relative-URL checks and then
  // navigate off-site (open redirect / phishing). The previous string-prefix checks
  // (startsWith("//"), includes("://")) did not catch this.
  if (/[\\\x00-\x1f]/.test(url)) return "/";
  try {
    // Resolve against our own origin and require the result to stay same-origin.
    // This rejects absolute URLs, protocol-relative INPUT and javascript: URIs.
    const resolved = new URL(url, window.location.origin);
    if (resolved.origin !== window.location.origin) return "/";
    const safe = resolved.pathname + resolved.search + resolved.hash;
    // ...but the same-origin check alone is not enough. Dot segments are removed
    // while parsing, so "/.//evil.com" (or "/..//evil.com", "/%2e//evil.com")
    // resolves ON our origin with the pathname "//evil.com" — and that string,
    // handed to `window.location.href`, is protocol-relative: it navigates to
    // https://evil.com. Check the OUTPUT too.
    return safe.startsWith("//") ? "/" : safe;
  } catch {
    return "/";
  }
}

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = getSafeCallbackUrl(searchParams?.get("callbackUrl"));
  const isRedirecting = useRef(false);
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending) return;

    if (session) {
      // User is already signed in, redirect to callback URL
      window.location.href = callbackUrl;
    } else if (!isRedirecting.current) {
      // User is not signed in, initiate sign in. `provider` is typed as any
      // string, so a wrong id compiles and 404s at runtime — use the constant.
      // A failure to START the flow (rate limit, network, provider missing)
      // must not leave the user on an endless spinner.
      isRedirecting.current = true;
      authClient.signIn
        .social({ provider: MP_PROVIDER_ID, callbackURL: callbackUrl })
        .then(({ error }) => {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full navigation to /auth-error is intended; router.replace() rendered only the Suspense fallback there
          if (error) window.location.assign("/auth-error?error=sign_in_start_failed");
        })
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- as above
        .catch(() => window.location.assign("/auth-error?error=sign_in_start_failed"));
    }
  }, [callbackUrl, session, isPending]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-4">Redirecting to sign in...</h2>
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent mx-auto"></div>
      </div>
    </div>
  );
}

function SignInFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-4">Loading...</h2>
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent mx-auto"></div>
      </div>
    </div>
  );
}

export function SignIn() {
  return (
    <Suspense fallback={<SignInFallback />}>
      <SignInContent />
    </Suspense>
  );
}