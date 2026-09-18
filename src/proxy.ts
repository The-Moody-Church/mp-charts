import { NextResponse, NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import {
  buildContentSecurityPolicy,
  createNonce,
  cspHeaderName,
  originOf,
} from '@/lib/security-headers';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Content-Security-Policy (F9) -----------------------------------------
  //
  // Built here, not in `next.config.ts`, because the nonce must be fresh per
  // request; a value fixed at build time is a constant and protects nothing.
  // The request-independent headers stay in the config so they also reach the
  // static-asset paths the matcher at the bottom of this file excludes.
  //
  // Ships as `Content-Security-Policy-Report-Only`. Enforcement needs
  // `CSP_ENFORCE=true`; see `src/lib/security-headers.ts` for why that default
  // is inverted from upstream's.
  const nonce = createNonce();
  const cspHeader = cspHeaderName();
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV === 'development',
    reportOnly: cspHeader === 'Content-Security-Policy-Report-Only',
    imageOrigin: originOf(process.env.NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL),
    formActionOrigin: originOf(process.env.MINISTRY_PLATFORM_BASE_URL),
  });

  // Next does NOT take the nonce from an argument. It re-reads it off the
  // INCOMING request headers during render and stamps it onto its own script
  // tags. Setting the policy on the response alone would produce a nonce that
  // matches nothing on the page.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(cspHeader, csp);

  // Applied to every return path below, redirects included. A redirect body is
  // never rendered, so the header does nothing there — it is set anyway so the
  // invariant is "every response this proxy produces carries a CSP", with no
  // exception for a reader to wonder about.
  const withCsp = <T extends Response>(response: T): T => {
    response.headers.set(cspHeader, csp);
    return response;
  };

  const proceed = () =>
    withCsp(NextResponse.next({ request: { headers: requestHeaders } }));

  // Early returns for public paths.
  // /auth-error must be public: a failed OAuth callback lands there with no
  // session, and redirecting it to /signin would auto-start OAuth again and
  // loop forever. (F7, upstream MPNext 91d226f.)
  if (pathname.startsWith('/api') || pathname === '/signin' || pathname === '/auth-error') {
    return proceed();
  }

  try {
    const sessionCookie = getSessionCookie(request);

    if (!sessionCookie) {
      const signinUrl = new URL('/signin', request.url);
      signinUrl.searchParams.set('callbackUrl', pathname + request.nextUrl.search);
      return withCsp(NextResponse.redirect(signinUrl));
    }

    return proceed();

  } catch (error) {
    // Shape the error — never log the raw object, which may carry a
    // response body or a $filter string. (F5)
    console.error('Proxy: error checking session:', error instanceof Error ? error.message : String(error));
    const signinUrl = new URL('/signin', request.url);
    signinUrl.searchParams.set('callbackUrl', pathname + request.nextUrl.search);
    return withCsp(NextResponse.redirect(signinUrl));
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|assets/|manifest\\.json|sw\\.js|offline\\.html).*)',
  ],
};
