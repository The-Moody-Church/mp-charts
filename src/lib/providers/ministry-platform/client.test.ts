import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MinistryPlatformClient } from '@/lib/providers/ministry-platform/client';

/**
 * MinistryPlatformClient Tests
 *
 * Tests for the core Ministry Platform client that handles:
 * - OAuth2 client credentials token management
 * - Automatic token refresh before expiration
 * - HTTP client configuration with token injection
 */

// Mock the client credentials module
vi.mock('@/lib/providers/ministry-platform/auth/client-credentials', () => ({
  getClientCredentialsToken: vi.fn(),
}));

describe('MinistryPlatformClient', () => {
  let mockGetClientCredentialsToken: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    const { getClientCredentialsToken } = await import(
      '@/lib/providers/ministry-platform/auth/client-credentials'
    );
    mockGetClientCredentialsToken = getClientCredentialsToken as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create client with base URL from environment', () => {
      const client = new MinistryPlatformClient();
      const httpClient = client.getHttpClient();

      // Verify HTTP client was created
      expect(httpClient).toBeDefined();
    });

    // Audit N19: the `!` read is gone; an unusable base URL fails here, not as
    // `undefined/tables/...` on the first request.
    it.each([
      ['unset', undefined, 'MINISTRY_PLATFORM_BASE_URL is not set'],
      ['http on a real host', 'http://mp.example.com', 'MINISTRY_PLATFORM_BASE_URL must use https://'],
    ])('refuses a base URL that is %s', (_label, value, message) => {
      const saved = process.env.MINISTRY_PLATFORM_BASE_URL;
      if (value === undefined) delete process.env.MINISTRY_PLATFORM_BASE_URL;
      else process.env.MINISTRY_PLATFORM_BASE_URL = value;
      try {
        expect(() => new MinistryPlatformClient()).toThrow(message);
      } finally {
        process.env.MINISTRY_PLATFORM_BASE_URL = saved;
      }
    });
  });

  describe('Token Management - ensureValidToken', () => {
    it('should fetch new token when no token exists (initial state)', async () => {
      mockGetClientCredentialsToken.mockResolvedValueOnce({
        access_token: 'new-access-token',
        expires_in: 3600,
        token_type: 'Bearer',
      });

      const client = new MinistryPlatformClient();

      // Token should be fetched since expiresAt is initialized to epoch
      await client.ensureValidToken();

      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(1);
    });

    it('should not fetch new token when token is still valid', async () => {
      mockGetClientCredentialsToken.mockResolvedValueOnce({
        access_token: 'valid-token',
        expires_in: 3600,
        token_type: 'Bearer',
      });

      const client = new MinistryPlatformClient();

      // First call - should fetch token
      await client.ensureValidToken();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(1);

      // Advance time by 1 minute (well inside the token's validity window)
      vi.advanceTimersByTime(60 * 1000);

      // Second call - should NOT fetch new token
      await client.ensureValidToken();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(1);
    });

    it('should refresh token when expired', async () => {
      mockGetClientCredentialsToken
        .mockResolvedValueOnce({
          access_token: 'first-token',
          expires_in: 3600,
          token_type: 'Bearer',
        })
        .mockResolvedValueOnce({
          access_token: 'refreshed-token',
          expires_in: 3600,
          token_type: 'Bearer',
        });

      const client = new MinistryPlatformClient();

      // First call - fetch initial token
      await client.ensureValidToken();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(1);

      // Advance time past the token's usable life (3600s - 5min safety margin)
      vi.advanceTimersByTime(56 * 60 * 1000);

      // Second call - should fetch new token
      await client.ensureValidToken();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(2);
    });

    it('should throw error when token refresh fails', async () => {
      mockGetClientCredentialsToken.mockRejectedValueOnce(
        new Error('OAuth server unavailable')
      );

      const client = new MinistryPlatformClient();

      await expect(client.ensureValidToken()).rejects.toThrow('OAuth server unavailable');
    });

    // Batch 3 (audit N12, upstream MPNext 5aa0b5e): single-flight refresh.
    it('shares one refresh among concurrent callers (31-call cold dashboard)', async () => {
      let resolveToken!: (value: unknown) => void;
      mockGetClientCredentialsToken.mockImplementation(
        () => new Promise((resolve) => { resolveToken = resolve; })
      );

      const client = new MinistryPlatformClient();
      const calls = Array.from({ length: 31 }, () => client.ensureValidToken());

      resolveToken({ access_token: 'concurrent-token', expires_in: 3600, token_type: 'Bearer' });
      await Promise.all(calls);

      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(1);
    });

    it('shares one refresh at the expiry boundary too', async () => {
      mockGetClientCredentialsToken.mockResolvedValue({ access_token: 't', expires_in: 3600 });
      const client = new MinistryPlatformClient();
      await client.ensureValidToken();
      vi.advanceTimersByTime(56 * 60 * 1000);

      await Promise.all(Array.from({ length: 10 }, () => client.ensureValidToken()));
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(2);
    });

    it('rejects every waiter when the shared refresh fails, and the next call retries', async () => {
      let rejectToken!: (reason: unknown) => void;
      mockGetClientCredentialsToken.mockImplementationOnce(
        () => new Promise((_resolve, reject) => { rejectToken = reject; })
      );
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const client = new MinistryPlatformClient();
      const waiters = Array.from({ length: 5 }, () => client.ensureValidToken());
      rejectToken(new Error('token endpoint down'));

      const results = await Promise.allSettled(waiters);
      expect(results.every((r) => r.status === 'rejected')).toBe(true);
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(1);

      // The slot is cleared: no negative cache, the next call fetches again.
      mockGetClientCredentialsToken.mockResolvedValueOnce({ access_token: 'ok', expires_in: 3600 });
      await expect(client.ensureValidToken()).resolves.toBeUndefined();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(2);
    });

    it('logs a failed refresh through errorForLog (one line, no raw Error)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGetClientCredentialsToken.mockRejectedValueOnce(new Error('line one\nforged line'));

      const client = new MinistryPlatformClient();
      await expect(client.ensureValidToken()).rejects.toThrow('line one');

      expect(errorSpy).toHaveBeenCalledWith('Failed to refresh MP access token:', 'Error: line oneforged line');
      for (const arg of errorSpy.mock.calls[0]) expect(typeof arg).toBe('string');
    });
  });

  describe('Token Lifecycle', () => {
    it('should refresh 5 minutes before the reported expiration', async () => {
      // expires_in: 3600 minus the 5-minute safety margin => 55 minutes usable
      mockGetClientCredentialsToken
        .mockResolvedValueOnce({
          access_token: 'token-1',
          expires_in: 3600,
          token_type: 'Bearer',
        })
        .mockResolvedValueOnce({
          access_token: 'token-2',
          expires_in: 3600,
          token_type: 'Bearer',
        });

      const client = new MinistryPlatformClient();

      // Fetch initial token
      await client.ensureValidToken();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(1);

      // Advance to 54:59 - just inside the 55-minute window
      vi.advanceTimersByTime(54 * 60 * 1000 + 59 * 1000);

      // Should still be valid
      await client.ensureValidToken();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(1);

      // Advance 2 more seconds, past 55:00
      vi.advanceTimersByTime(2000);

      // Should refresh now
      await client.ensureValidToken();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(2);
    });

    it('should fall back to a 1-hour lifetime when expires_in is missing', async () => {
      mockGetClientCredentialsToken
        .mockResolvedValueOnce({
          access_token: 'no-expiry-token',
          token_type: 'Bearer',
        })
        .mockResolvedValueOnce({
          access_token: 'refreshed-token',
          token_type: 'Bearer',
        });

      const client = new MinistryPlatformClient();

      await client.ensureValidToken();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(1);

      // Same 55-minute boundary as an explicit expires_in: 3600
      vi.advanceTimersByTime(54 * 60 * 1000 + 59 * 1000);
      await client.ensureValidToken();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2000);
      await client.ensureValidToken();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(2);
    });

    it('should clamp a short expires_in to the 30-second floor', async () => {
      // 60s - 5min margin is negative, so the floor applies instead
      mockGetClientCredentialsToken
        .mockResolvedValueOnce({
          access_token: 'short-lived-token',
          expires_in: 60,
          token_type: 'Bearer',
        })
        .mockResolvedValueOnce({
          access_token: 'refreshed-token',
          expires_in: 60,
          token_type: 'Bearer',
        });

      const client = new MinistryPlatformClient();

      await client.ensureValidToken();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(1);

      // Just inside the 30-second floor
      vi.advanceTimersByTime(29 * 1000);
      await client.ensureValidToken();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(1);

      // Just past it
      vi.advanceTimersByTime(2000);
      await client.ensureValidToken();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(2);
    });

    it('should ignore a non-numeric expires_in and use the default lifetime', async () => {
      mockGetClientCredentialsToken.mockResolvedValueOnce({
        access_token: 'bogus-expiry-token',
        expires_in: 'not-a-number',
        token_type: 'Bearer',
      });

      const client = new MinistryPlatformClient();

      await client.ensureValidToken();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(1);

      // Would have refreshed immediately if NaN had reached expiresAt
      vi.advanceTimersByTime(54 * 60 * 1000);
      await client.ensureValidToken();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(1);
    });
  });

  // Batch 3 (audit N12, upstream MPNext 5aa0b5e): expires_in clamped to
  // [30 s, 3600 s]; absent, non-numeric, zero or negative uses the 3600 default.
  describe('Token lifetime clamp', () => {
    const lifetimeMs = async (expires_in: unknown): Promise<number> => {
      mockGetClientCredentialsToken.mockResolvedValue({ access_token: 't', expires_in });
      const client = new MinistryPlatformClient();
      const start = Date.now();
      await client.ensureValidToken();
      const expiresAt = (client as unknown as { expiresAt: Date }).expiresAt.getTime();
      return expiresAt - start;
    };

    it.each([
      ['1e13', 1e13, 55 * 60 * 1000],
      ['Number.MAX_VALUE', Number.MAX_VALUE, 55 * 60 * 1000],
      ['7200 (above the ceiling)', 7200, 55 * 60 * 1000],
      ['"1e13" (numeric string)', '1e13', 55 * 60 * 1000],
      ['Infinity', Infinity, 55 * 60 * 1000],
      ['-1', -1, 55 * 60 * 1000],
      ['0', 0, 55 * 60 * 1000],
      ['"abc"', 'abc', 55 * 60 * 1000],
      ['absent', undefined, 55 * 60 * 1000],
      ['null', null, 55 * 60 * 1000],
      ['an object', { a: 1 }, 55 * 60 * 1000],
      ['1 (below the floor)', 1, 30 * 1000],
      ['1800', 1800, 25 * 60 * 1000],
    ])('expires_in %s gives a finite expiry inside [30 s, 55 min]', async (_label, value, expected) => {
      const ms = await lifetimeMs(value);
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBe(expected);
    });

    it('refreshes again after a huge expires_in (no Invalid Date that never expires)', async () => {
      mockGetClientCredentialsToken.mockResolvedValue({ access_token: 't', expires_in: 1e13 });
      const client = new MinistryPlatformClient();
      await client.ensureValidToken();
      vi.advanceTimersByTime(56 * 60 * 1000);
      await client.ensureValidToken();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(2);
    });
  });

  describe('User-token mode (fork-only)', () => {
    it('uses the provided accessToken and never calls client-credentials', async () => {
      const client = new MinistryPlatformClient({ accessToken: 'user-oidc-token' });

      await client.ensureValidToken();
      // Even far in the future — auth.ts owns the user token's lifecycle.
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);
      await client.ensureValidToken();

      expect(mockGetClientCredentialsToken).not.toHaveBeenCalled();
    });
  });

  describe('HTTP Client', () => {
    it('should return the same HttpClient instance', () => {
      const client = new MinistryPlatformClient();

      const httpClient1 = client.getHttpClient();
      const httpClient2 = client.getHttpClient();

      expect(httpClient1).toBe(httpClient2);
    });

    it('should provide HttpClient with token getter', async () => {
      mockGetClientCredentialsToken.mockResolvedValueOnce({
        access_token: 'injected-token',
        expires_in: 3600,
        token_type: 'Bearer',
      });

      const client = new MinistryPlatformClient();
      await client.ensureValidToken();

      const httpClient = client.getHttpClient();

      // The HttpClient should have access to the token via the getter
      // This is tested indirectly through the URL building
      expect(httpClient).toBeDefined();
      expect(typeof httpClient.buildUrl).toBe('function');
    });
  });

  describe('Error Handling', () => {
    it('should propagate network errors from token refresh', async () => {
      mockGetClientCredentialsToken.mockRejectedValueOnce(
        new TypeError('Failed to fetch')
      );

      const client = new MinistryPlatformClient();

      await expect(client.ensureValidToken()).rejects.toThrow('Failed to fetch');
    });

    it('should propagate authentication errors', async () => {
      mockGetClientCredentialsToken.mockRejectedValueOnce(
        new Error('invalid_client: Client authentication failed')
      );

      const client = new MinistryPlatformClient();

      await expect(client.ensureValidToken()).rejects.toThrow(
        'invalid_client: Client authentication failed'
      );
    });

    it('should allow retry after failed token refresh', async () => {
      mockGetClientCredentialsToken
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({
          access_token: 'retry-success-token',
          expires_in: 3600,
          token_type: 'Bearer',
        });

      const client = new MinistryPlatformClient();

      // First attempt fails
      await expect(client.ensureValidToken()).rejects.toThrow('Temporary error');

      // Second attempt succeeds
      await client.ensureValidToken();
      expect(mockGetClientCredentialsToken).toHaveBeenCalledTimes(2);
    });
  });
});
