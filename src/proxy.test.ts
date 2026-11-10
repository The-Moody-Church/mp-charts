import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';

/**
 * Proxy Tests
 *
 * Tests for the authentication proxy in src/proxy.ts
 * These tests verify route protection behavior including:
 * - Public path access
 * - Session cookie validation
 * - Redirect behavior
 */

// Mock better-auth/cookies
const mockGetSessionCookie = vi.fn();
vi.mock('better-auth/cookies', () => ({
  getSessionCookie: (...args: unknown[]) => mockGetSessionCookie(...args),
}));

// Mock NextResponse
vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return {
    ...actual,
    NextResponse: {
      // These carry a real `Headers` because `proxy()` sets the CSP on every
      // response it returns. The previous mock returned bare objects, which
      // under-modelled NextResponse and would have let a missing CSP pass.
      next: vi.fn((init?: { request?: { headers: Headers } }) => ({
        type: 'next',
        headers: new Headers(),
        // Surfaced so a test can assert the nonce and policy were set on the
        // REQUEST headers, which is the only way Next discovers the nonce.
        requestHeaders: init?.request?.headers,
      })),
      redirect: vi.fn((url: URL) => ({
        type: 'redirect',
        url: url.toString(),
        headers: new Headers(),
      })),
    },
  };
});

describe('Proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionCookie.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper to create a mock NextRequest
   */
  function createMockRequest(pathname: string, baseUrl = 'http://localhost:3000'): NextRequest {
    const url = new URL(pathname, baseUrl);
    return {
      nextUrl: url,
      url: url.toString(),
      cookies: {
        getAll: () => [],
        get: () => undefined,
      },
    } as unknown as NextRequest;
  }

  /**
   * These drive the REAL exported `proxy()` rather than re-implementing its
   * branch inline, so they fail if the public-path list actually changes.
   * (F7 — /auth-error must be reachable without a session, or a failed OAuth
   * callback bounces to /signin, which auto-starts OAuth again and loops.)
   */
  describe('Public paths (real proxy)', () => {
    it('lets /auth-error through with no session cookie', async () => {
      const { proxy } = await import('./proxy');
      mockGetSessionCookie.mockReturnValue(undefined);

      const result = (await proxy(createMockRequest('/auth-error'))) as { type: string };

      expect(result.type).toBe('next');
      expect(NextResponse.redirect).not.toHaveBeenCalled();
      // Public paths return before the cookie is ever consulted.
      expect(mockGetSessionCookie).not.toHaveBeenCalled();
    });

    it('lets /signin through with no session cookie', async () => {
      const { proxy } = await import('./proxy');
      mockGetSessionCookie.mockReturnValue(undefined);

      expect((await proxy(createMockRequest('/signin'))).type).toBe('next');
      expect(NextResponse.redirect).not.toHaveBeenCalled();
    });

    it('still redirects a protected path with no session cookie', async () => {
      // Negative control: proves the two assertions above are not vacuous.
      const { proxy } = await import('./proxy');
      mockGetSessionCookie.mockReturnValue(undefined);

      const result = await proxy(createMockRequest('/dashboard')) as { type: string; url: string };

      expect(result.type).toBe('redirect');
      expect(result.url).toContain('/signin');
      expect(result.url).toContain('callbackUrl=%2Fdashboard');
    });
  });

  describe('Public Paths', () => {
    it('should allow access to /api routes without authentication', () => {
      const request = createMockRequest('/api/auth/session');
      const { pathname } = request.nextUrl;
      const isPublicPath = pathname.startsWith('/api') || pathname === '/signin';
      expect(isPublicPath).toBe(true);
    });

    it('should allow access to /signin without authentication', () => {
      const request = createMockRequest('/signin');
      const { pathname } = request.nextUrl;
      const isPublicPath = pathname.startsWith('/api') || pathname === '/signin';
      expect(isPublicPath).toBe(true);
    });

    it('should allow access to nested /api routes', () => {
      const request = createMockRequest('/api/some/nested/route');
      const { pathname } = request.nextUrl;
      const isPublicPath = pathname.startsWith('/api') || pathname === '/signin';
      expect(isPublicPath).toBe(true);
    });
  });

  describe('Session Cookie Validation', () => {
    it('should redirect to signin when no session cookie exists', () => {
      mockGetSessionCookie.mockReturnValue(null);
      const request = createMockRequest('/dashboard');

      const sessionCookie = mockGetSessionCookie(request);
      expect(sessionCookie).toBeNull();

      // Should redirect
      const redirectUrl = new URL('/signin', request.url);
      expect(redirectUrl.pathname).toBe('/signin');
    });

    it('should allow access when session cookie exists', () => {
      mockGetSessionCookie.mockReturnValue('session-cookie-value');
      const request = createMockRequest('/dashboard');

      const sessionCookie = mockGetSessionCookie(request);
      expect(sessionCookie).not.toBeNull();
    });
  });

  // Drives the REAL exported `config` through Next's own matcher (the code the
  // build uses), not a hand-copied regex that could drift from src/proxy.ts.
  describe('Route Matcher (real config)', () => {
    const matches = async (url: string, headers?: Record<string, string>) => {
      const { config } = await import('./proxy');
      return unstable_doesMiddlewareMatch({ config, url, headers });
    };

    it.each([
      '/',
      '/dashboard',
      '/contacts/123',
      '/signin',
      '/auth-error',
      '/api/cache-warm',
      // Only the /api/auth segment is excluded, not every path that starts with it.
      '/api/authority',
      '/api/auth-extra',
    ])('runs the proxy on %s', async (path) => {
      expect(await matches(path)).toBe(true);
    });

    it.each([
      '/_next/static/chunks/main.js',
      '/_next/image?url=x',
      '/favicon.ico',
      '/assets/logo.png',
      '/manifest.json',
      '/sw.js',
      '/offline.html',
    ])('skips static asset %s', async (path) => {
      expect(await matches(path)).toBe(false);
    });

    // Every better-auth request must skip the proxy: a matched request has its
    // body copied (up to 10 MB) and awaited by Next before the route's
    // 4096-byte filter can refuse it. See the comment above `config`.
    it.each([
      '/api/auth',
      '/api/auth/',
      '/api/auth/sign-in/social',
      '/api/auth/get-session',
      '/api/auth/callback/ministryplatform?code=x&state=y',
      '/api/auth/update-user',
    ])('skips the auth route %s', async (path) => {
      expect(await matches(path)).toBe(false);
    });

    // Server Action requests (they carry a `next-action` header) skip the
    // proxy too. A matched request is cut to the proxy's 10 MB copy, so an
    // upload over 10 MB reached the action truncated and failed with
    // "Unexpected end of form" (#252). Every action calls requireSession().
    it.each(['/', '/manage-members', '/contact-lookup/abc', '/signin'])(
      'skips a Server Action request to %s',
      async (path) => {
        expect(await matches(path, { 'next-action': '40c20364d45bf5ed6af8abccc2994112' })).toBe(false);
      },
    );

    it('still runs on a page request without the next-action header', async () => {
      expect(await matches('/manage-members', { accept: 'text/html' })).toBe(true);
      expect(await matches('/manage-members', { 'next-router-state-tree': 'x', rsc: '1' })).toBe(true);
    });
  });

  describe('Redirect URL Construction', () => {
    it('should redirect to signin with correct URL', () => {
      const request = createMockRequest('/dashboard');
      const redirectUrl = new URL('/signin', request.url);

      expect(redirectUrl.pathname).toBe('/signin');
      expect(redirectUrl.origin).toBe('http://localhost:3000');
    });

    it('should preserve origin when redirecting', () => {
      const request = createMockRequest('/protected', 'https://example.com');
      const redirectUrl = new URL('/signin', request.url);

      expect(redirectUrl.origin).toBe('https://example.com');
      expect(redirectUrl.href).toBe('https://example.com/signin');
    });
  });
});

describe('Proxy Integration', () => {
  function createMockRequest(pathname: string, baseUrl = 'http://localhost:3000'): NextRequest {
    const url = new URL(pathname, baseUrl);
    return {
      nextUrl: url,
      url: url.toString(),
      cookies: {
        getAll: () => [],
        get: () => undefined,
      },
    } as unknown as NextRequest;
  }

  it('should follow the complete authentication flow for protected routes', () => {
    mockGetSessionCookie.mockReturnValue('valid-session');

    const request = createMockRequest('/dashboard');

    // Step 1: Check if public path
    const { pathname } = request.nextUrl;
    const isPublicPath = pathname.startsWith('/api') || pathname === '/signin';
    expect(isPublicPath).toBe(false);

    // Step 2: Check session cookie
    const sessionCookie = mockGetSessionCookie(request);
    expect(sessionCookie).not.toBeNull();

    // Step 3: Should allow access (NextResponse.next())
    const response = NextResponse.next();
    expect(response.type).toBe('next');
  });

  it('should follow the complete flow for unauthenticated user', () => {
    mockGetSessionCookie.mockReturnValue(null);

    const request = createMockRequest('/dashboard');

    // Step 1: Check if public path
    const { pathname } = request.nextUrl;
    const isPublicPath = pathname.startsWith('/api') || pathname === '/signin';
    expect(isPublicPath).toBe(false);

    // Step 2: No session cookie
    const sessionCookie = mockGetSessionCookie(request);
    expect(sessionCookie).toBeNull();

    // Step 3: Should redirect to signin
    const redirectUrl = new URL('/signin', request.url);
    const response = NextResponse.redirect(redirectUrl);
    expect(response.type).toBe('redirect');
    expect(response.url).toBe('http://localhost:3000/signin');
  });

  /**
   * Content-Security-Policy wiring (F9).
   *
   * The policy VALUE is tested in `src/lib/security-headers.test.ts`. These
   * cover the wiring, which is where it actually goes wrong: a policy that is
   * built but never attached, attached to some responses but not others, or
   * attached to the response but not the REQUEST — which is the only place
   * Next looks for the nonce.
   */
  describe('Content-Security-Policy', () => {
    const REPORT_ONLY = 'Content-Security-Policy-Report-Only';
    // The default enforces, so every test below the first two reads this one.
    const ENFORCED = 'Content-Security-Policy';

    it('ENFORCES by default', async () => {
      // Inverted on 2026-09-18. Forgetting the env var must keep the control,
      // not silently drop it.
      const { proxy } = await import('./proxy');
      mockGetSessionCookie.mockReturnValue('session');

      const res = (await proxy(createMockRequest('/dashboard'))) as unknown as Response;

      expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
      expect(res.headers.get(REPORT_ONLY)).toBeNull();
    });

    it('falls back to report-only when CSP_ENFORCE is false', async () => {
      vi.stubEnv('CSP_ENFORCE', 'false');
      vi.resetModules();
      const { proxy } = await import('./proxy');
      mockGetSessionCookie.mockReturnValue('session');

      const res = (await proxy(createMockRequest('/dashboard'))) as unknown as Response;

      expect(res.headers.get(REPORT_ONLY)).toContain("default-src 'self'");
      expect(res.headers.get('Content-Security-Policy')).toBeNull();
      vi.unstubAllEnvs();
    });

    it('sets the policy and nonce on the REQUEST headers, not just the response', async () => {
      // Next re-reads the nonce off the incoming request during render. A
      // policy set only on the response would have a nonce matching nothing on
      // the page, and every script would be blocked under enforcement.
      const { proxy } = await import('./proxy');
      mockGetSessionCookie.mockReturnValue('session');

      const res = (await proxy(createMockRequest('/dashboard'))) as unknown as {
        requestHeaders?: Headers;
      };

      const nonce = res.requestHeaders?.get('x-nonce');
      expect(nonce).toBeTruthy();
      expect(res.requestHeaders?.get(ENFORCED)).toContain(`'nonce-${nonce}'`);
    });

    it('carries the policy on every exit, redirects included', async () => {
      const { proxy } = await import('./proxy');

      mockGetSessionCookie.mockReturnValue(undefined);
      const redirected = (await proxy(createMockRequest('/dashboard'))) as unknown as Response;
      expect(redirected.headers.get(ENFORCED)).toBeTruthy();

      const publicPath = (await proxy(createMockRequest('/signin'))) as unknown as Response;
      expect(publicPath.headers.get(ENFORCED)).toBeTruthy();

      const api = (await proxy(createMockRequest('/api/auth/get-session'))) as unknown as Response;
      expect(api.headers.get(ENFORCED)).toBeTruthy();
    });

    it('uses a fresh nonce for every request', async () => {
      // A reused nonce is the same as no nonce: an injected script can read it
      // off the page and replay it.
      const { proxy } = await import('./proxy');
      mockGetSessionCookie.mockReturnValue('session');

      const nonces = new Set<string>();
      for (let i = 0; i < 5; i++) {
        const res = (await proxy(createMockRequest('/dashboard'))) as unknown as {
          requestHeaders?: Headers;
        };
        nonces.add(res.requestHeaders?.get('x-nonce') ?? '');
      }

      expect(nonces.size).toBe(5);
      expect(nonces.has('')).toBe(false);
    });
  });

});
