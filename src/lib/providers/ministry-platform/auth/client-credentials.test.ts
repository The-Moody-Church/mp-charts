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

  it('throws on non-OK response, with the status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    }));

    await expect(getClientCredentialsToken()).rejects.toThrow('Failed to get client credentials token: 401 Unauthorized');
  });

  // Audit N19: this request carries the client secret, so an unset or http
  // base URL must be refused before anything is sent.
  it.each([
    ['unset', undefined, 'MINISTRY_PLATFORM_BASE_URL is not set'],
    ['http on a real host', 'http://mp.example.com', 'MINISTRY_PLATFORM_BASE_URL must use https://'],
    ['carrying credentials', 'https://u:p@mp.example.com', 'MINISTRY_PLATFORM_BASE_URL must not contain credentials'],
  ])('refuses a base URL that is %s before any fetch', async (_label, value, message) => {
    if (value === undefined) delete process.env.MINISTRY_PLATFORM_BASE_URL;
    else process.env.MINISTRY_PLATFORM_BASE_URL = value;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(getClientCredentialsToken()).rejects.toThrow(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the MP path and drops a trailing slash (no //oauth)', async () => {
    process.env.MINISTRY_PLATFORM_BASE_URL = 'https://mp.example.com/ministryplatformapi/';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ access_token: 't', token_type: 'Bearer' }),
    }));

    await getClientCredentialsToken();

    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://mp.example.com/ministryplatformapi/oauth/connect/token');
  });

  // Batch 3 (audit N12, upstream MPNext 5aa0b5e, adapted).
  describe('request options', () => {
    it('refuses redirects and sets the 10 s token timeout', async () => {
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 't', token_type: 'Bearer', expires_in: 3600 }),
      }));

      await getClientCredentialsToken();

      const init = vi.mocked(fetch).mock.calls[0][1];
      expect(init?.redirect).toBe('error');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(timeoutSpy).toHaveBeenCalledWith(10_000);
      timeoutSpy.mockRestore();
    });
  });

  describe('transport and parse failures (fixed messages)', () => {
    it.each([
      ['a refused redirect / network error', new TypeError('fetch failed: https://u:test-client-secret@x'), 'TypeError'],
      ['a timeout', new DOMException('The operation was aborted due to timeout', 'TimeoutError'), 'TimeoutError'],
      ['a non-Error rejection', 'boom test-client-secret', 'string'],
      // The name filter: an error name that is not a plain class name is not copied.
      [
        'an error whose name carries text',
        Object.assign(new Error('x'), { name: 'secret test-client-secret\n' }),
        'object',
      ],
      // The cause's class and code are added (never its message).
      [
        'a refused connection',
        new TypeError('fetch failed', {
          cause: Object.assign(new Error('connect ECONNREFUSED test-client-secret'), { code: 'ECONNREFUSED' }),
        }),
        'TypeError (cause: Error ECONNREFUSED)',
      ],
      [
        'a refused redirect',
        new TypeError('fetch failed', { cause: new Error('unexpected redirect') }),
        'TypeError (cause: Error redirect refused)',
      ],
    ])('reports %s by error name only', async (_label, rejection, name) => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(rejection));
      const error = await getClientCredentialsToken().catch((e: Error) => e);
      expect((error as Error).message).toBe(`Failed to get client credentials token: ${name}`);
      expect((error as Error).message).not.toContain('test-client-secret');
    });

    it('reports a non-JSON 200 body without quoting it', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
        new Response('<html>test-client-secret</html>', { status: 200 })
      ));
      const error = await getClientCredentialsToken().catch((e: Error) => e);
      expect((error as Error).message).toBe('Failed to get client credentials token: invalid JSON response');
    });

    it('never puts the response body in a non-OK error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
        new Response('{"error":"invalid_client","detail":"test-client-secret"}', { status: 400 })
      ));
      const error = await getClientCredentialsToken().catch((e: Error) => e);
      expect((error as Error).message).toBe('Failed to get client credentials token: 400');
    });
  });

  describe('token response validation', () => {
    const respond = (body: unknown) =>
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(body) }));

    it.each([
      ['an empty object', {}],
      ['a blank access_token', { access_token: '', token_type: 'Bearer' }],
      ['a whitespace access_token', { access_token: '   ', token_type: 'Bearer' }],
      ['a numeric access_token', { access_token: 12345, token_type: 'Bearer' }],
      ['an object access_token', { access_token: { a: 1 } }],
      ['null', null],
      ['an array', []],
      ['a string', 'token'],
      // Header-safe: undici's invalid-header TypeError would quote the token.
      ['a token containing NUL', { access_token: 'tok\u0000abc', token_type: 'Bearer' }],
      ['a token containing CR/LF', { access_token: 'tok\r\nX-Injected: 1', token_type: 'Bearer' }],
      ['a token containing a space', { access_token: 'tok abc', token_type: 'Bearer' }],
      ['a whitespace-padded token', { access_token: ' tok-abc ', token_type: 'Bearer' }],
      ['a non-ASCII token', { access_token: 'tok\u00e9', token_type: 'Bearer' }],
    ])('rejects %s', async (_label, body) => {
      respond(body);
      await expect(getClientCredentialsToken()).rejects.toThrow(
        'Failed to get client credentials token: invalid token response'
      );
    });

    it.each([
      ['absent', { access_token: 'tok-abc' }],
      ['null', { access_token: 'tok-abc', token_type: null }],
      ['"Bearer"', { access_token: 'tok-abc', token_type: 'Bearer' }],
      ['"bearer"', { access_token: 'tok-abc', token_type: 'bearer' }],
      ['"BEARER"', { access_token: 'tok-abc', token_type: 'BEARER' }],
    ])('accepts token_type %s', async (_label, body) => {
      respond(body);
      await expect(getClientCredentialsToken()).resolves.toMatchObject({ access_token: 'tok-abc' });
    });

    it.each([
      'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl',
      'A1b2-._~+/xyz==',
      '0123456789ABCDEF0123456789ABCDEF',
    ])('accepts a header-safe token (%s)', async (accessToken) => {
      respond({ access_token: accessToken, token_type: 'Bearer' });
      await expect(getClientCredentialsToken()).resolves.toMatchObject({ access_token: accessToken });
    });

    it.each([
      ['"mac"', 'mac'],
      ['"Basic"', 'Basic'],
      ['an empty string', ''],
      ['a number', 1],
    ])('refuses a present token_type that is not bearer (%s)', async (_label, tokenType) => {
      respond({ access_token: 'tok-abc', token_type: tokenType });
      const error = await getClientCredentialsToken().catch((e: Error) => e);
      expect((error as Error).message).toBe('Failed to get client credentials token: unsupported token type');
      expect((error as Error).message).not.toContain('tok-abc');
    });
  });
});
