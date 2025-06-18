import { NextResponse, NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // console.log(`Middleware: Processing ${pathname}`);
  
  // Early returns for public paths
  if (pathname.startsWith('/api') || pathname === '/signin') {
    console.log(`Middleware: Allowing public path ${pathname}`);
    return NextResponse.next();
  }

  try {
    // Use getToken with more explicit configuration
    let token = await getToken({ 
      req: request, 
      secret: process.env.NEXTAUTH_SECRET,
      cookieName: '__Secure-next-auth.session-token' 
    });   

    // If secure cookie doesn't work, try the regular one
    if (!token) {
      token = await getToken({ 
        req: request, 
        secret: process.env.NEXTAUTH_SECRET,
        cookieName: 'next-auth.session-token'
      });
    }    

    // console.log('Middleware: Token exists:', !!token);
    // console.log('Middleware: Available cookies:', request.cookies.getAll().map(c => c.name));

    // console.log('Middleware: Token exp:', token?.exp);
    
    if (!token) {
      console.log("Middleware: Redirecting to signin - no token");
      return NextResponse.redirect(new URL('/signin', request.url));
    }
    
    // Check token expiration - use the standard 'exp' claim
    if (token.exp && Date.now() >= (token.exp * 1000)) {
      console.log("Middleware: Redirecting to signin - token expired (exp)");
      return NextResponse.redirect(new URL('/signin', request.url));
    }
    
    console.log(`Middleware: Allowing request to ${pathname}`);
    return NextResponse.next();
    
  } catch (error) {
    console.error('Middleware: Error getting token:', error);
    return NextResponse.redirect(new URL('/signin', request.url));
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|manifest.json|favicon.ico|assets/).*)',
  ],
};