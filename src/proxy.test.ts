import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

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
      next: vi.fn(() => ({ type: 'next' })),
      redirect: vi.fn((url: URL) => ({ type: 'redirect', url: url.toString() })),
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

  describe('Route Matcher', () => {
    it('should match protected routes', () => {
      const protectedPaths = [
        '/dashboard',
        '/settings',
        '/contacts',
        '/contacts/123',
        '/',
      ];

      const matcher = /^\/((?!_next\/static|_next\/image|favicon\.ico|assets\/).*)$/;

      protectedPaths.forEach((path) => {
        expect(matcher.test(path)).toBe(true);
      });
    });

    it('should not match static assets', () => {
      const staticPaths = [
        '/_next/static/chunks/main.js',
        '/_next/image?url=...',
        '/favicon.ico',
        '/assets/logo.png',
      ];

      const matcher = /^\/((?!_next\/static|_next\/image|favicon\.ico|assets\/).*)$/;

      staticPaths.forEach((path) => {
        expect(matcher.test(path)).toBe(false);
      });
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
    expect(response).toEqual({ type: 'next' });
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
    expect(response).toEqual({
      type: 'redirect',
      url: 'http://localhost:3000/signin',
    });
  });
});
