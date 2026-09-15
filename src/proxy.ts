import { NextResponse, NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const isDev = process.env.NODE_ENV === 'development';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Early returns for public paths.
  // /auth-error must be public: a failed OAuth callback lands there with no
  // session, and redirecting it to /signin would auto-start OAuth again and
  // loop forever. (F7, upstream MPNext 91d226f.)
  if (pathname.startsWith('/api') || pathname === '/signin' || pathname === '/auth-error') {
    if (isDev) console.log(`Proxy: Allowing public path ${pathname}`);
    return NextResponse.next();
  }

  try {
    const sessionCookie = getSessionCookie(request);

    if (!sessionCookie) {
      if (isDev) console.log("Proxy: Redirecting to signin - no session cookie");
      const signinUrl = new URL('/signin', request.url);
      signinUrl.searchParams.set('callbackUrl', pathname + request.nextUrl.search);
      return NextResponse.redirect(signinUrl);
    }

    if (isDev) console.log(`Proxy: Allowing request to ${pathname}`);
    return NextResponse.next();

  } catch (error) {
    console.error('Proxy: Error checking session:', error);
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