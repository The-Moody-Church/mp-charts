import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getClientCredentialsToken } from './client-credentials';

describe('getClientCredentialsToken', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      MINISTRY_PLATFORM_BASE_URL: 'https://mp.example.com',
      MINISTRY_PLATFORM_CLIENT_ID: 'test-client-id',
      MINISTRY_PLATFORM_CLIENT_SECRET: 'test-client-secret',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it('posts to the oauth token endpoint with correct params', async () => {
    const mockToken = { access_token: 'token-123', token_type: 'Bearer', expires_in: 3600 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockToken),
    }));

    const result = await getClientCredentialsToken();
    expect(result).toEqual(mockToken);

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    expect(fetchCall[0]).toBe('https://mp.example.com/oauth/connect/token');
    const body = fetchCall[1]?.body as string;
    expect(body).toContain('grant_type=client_credentials');
    expect(body).toContain('client_id=test-client-id');
    expect(body).toContain('client_secret=test-client-secret');
  });

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      statusText: 'Unauthorized',
    }));

    await expect(getClientCredentialsToken()).rejects.toThrow('Failed to get client credentials token: Unauthorized');
  });
});
