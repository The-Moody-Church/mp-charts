import { NextResponse, NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Early returns for public paths.
  // /auth-error must be public: a failed OAuth callback lands there with no
  // session, and redirecting it to /signin would auto-start OAuth again and
  // loop forever. (F7, upstream MPNext 91d226f.)
  if (pathname.startsWith('/api') || pathname === '/signin' || pathname === '/auth-error') {
    return NextResponse.next();
  }

  try {
    const sessionCookie = getSessionCookie(request);

    if (!sessionCookie) {
      const signinUrl = new URL('/signin', request.url);
      signinUrl.searchParams.set('callbackUrl', pathname + request.nextUrl.search);
      return NextResponse.redirect(signinUrl);
    }

    return NextResponse.next();

  } catch (error) {
    // Shape the error — never log the raw object, which may carry a
    // response body or a $filter string. (F5)
    console.error('Proxy: error checking session:', error instanceof Error ? error.message : String(error));
    const signinUrl = new URL('/signin', request.url);
    signinUrl.searchParams.set('callbackUrl', pathname + request.nextUrl.search);
    return NextResponse.redirect(signinUrl);
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|assets/|manifest\\.json|sw\\.js|offline\\.html).*)',
  ],
};