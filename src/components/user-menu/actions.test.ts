import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const { mockSignOut, mockGetSession, mockFindAccountByUserId, mockRedirect } = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
  mockGetSession: vi.fn(),
  mockFindAccountByUserId: vi.fn(),
  mockRedirect: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      signOut: mockSignOut,
      getSession: mockGetSession,
    },
    $context: Promise.resolve({
      internalAdapter: { findAccountByUserId: mockFindAccountByUserId },
    }),
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

import { handleSignOut } from './actions';
import { rememberIdToken, __resetIdTokenStore } from '@/lib/id-token-store';

const GUID = 'ab12cd34-ef56-7890-abcd-ef1234567890';
const signedIn = { user: { id: 'user-1', userGuid: GUID } };

/** The URL handleSignOut redirected to, parsed. */
function redirectedTo(): URL {
  expect(mockRedirect).toHaveBeenCalledTimes(1);
  return new URL(mockRedirect.mock.calls[0][0] as string);
}

describe('handleSignOut', () => {
  const originalEnv = process.env;
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    __resetIdTokenStore();
    process.env = { ...originalEnv };
    process.env.MINISTRY_PLATFORM_BASE_URL = 'https://mp.example.com';
    process.env.BETTER_AUTH_URL = 'https://myapp.example.com';
    mockGetSession.mockResolvedValue(null);
    mockFindAccountByUserId.mockResolvedValue([]);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should call auth.api.signOut', async () => {
    mockSignOut.mockResolvedValueOnce(undefined);

    await handleSignOut();

    expect(mockSignOut).toHaveBeenCalledWith({
      headers: expect.any(Headers),
    });
  });

  it('should redirect to MP end session URL', async () => {
    mockSignOut.mockResolvedValueOnce(undefined);

    await handleSignOut();

    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining('https://mp.example.com/oauth/connect/endsession')
    );
    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining('post_logout_redirect_uri=https%3A%2F%2Fmyapp.example.com')
    );
  });

  it('should throw when MINISTRY_PLATFORM_BASE_URL is missing', async () => {
    delete process.env.MINISTRY_PLATFORM_BASE_URL;
    mockSignOut.mockResolvedValueOnce(undefined);

    await expect(handleSignOut()).rejects.toThrow('MINISTRY_PLATFORM_BASE_URL is not configured');
  });

  describe('id_token_hint', () => {
    // Without it MP ignores post_logout_redirect_uri and leaves the user on its
    // own logged-out page. See src/lib/auth-endsession.ts.

    it('sends the ID token captured at sign-in, and says nothing', async () => {
      rememberIdToken(GUID, 'id.token.jwt');
      mockGetSession.mockResolvedValue(signedIn);

      await handleSignOut();

      expect(redirectedTo().searchParams.get('id_token_hint')).toBe('id.token.jwt');
      expect(warn).not.toHaveBeenCalled();
    });

    it('still signs out without a session, and says why (no-session)', async () => {
      // What a lapsed cookie cache looks like from here. The user menu
      // re-mints the cookie before calling this so it does not happen there.
      mockGetSession.mockResolvedValue(null);

      await handleSignOut();

      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(redirectedTo().searchParams.has('id_token_hint')).toBe(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('id_token_hint omitted (no-session)'));
    });

    it('never lets a failed lookup block sign-out, and warns like every other no-hint path', async () => {
      rememberIdToken(GUID, 'id.token.jwt');
      mockGetSession.mockRejectedValue(new TypeError('boom'));

      await handleSignOut();

      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(redirectedTo().searchParams.has('id_token_hint')).toBe(false);
      expect(error).toHaveBeenCalledWith(
        'signout.idToken.lookup',
        expect.objectContaining({ name: 'TypeError' })
      );
      // The same "hint omitted" line as every other no-hint path, so its
      // absence from the log really does mean the hint was sent.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('id_token_hint omitted (lookup-failed)'));
      // And the token itself is never logged.
      const logged = [...warn.mock.calls, ...error.mock.calls]
        .flat()
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
        .join(' ');
      expect(logged).not.toContain('id.token.jwt');
    });
  });
});
