import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpClient } from '@/lib/providers/ministry-platform/utils/http-client';
import { MP_API_TIMEOUT_MS, MP_UPLOAD_TIMEOUT_MS } from '@/lib/providers/ministry-platform/utils/timeouts';

/**
 * HttpClient Tests
 *
 * Tests for the HTTP client utility that handles all Ministry Platform API requests.
 * Tests cover:
 * - HTTP methods (GET, POST, PUT, DELETE)
 * - URL building and query parameter encoding
 * - Authorization header injection
 * - Error handling for failed requests
 * - FormData handling
 */

// Mock global fetch (the real one is kept for the tests that talk to a local server)
const nodeFetch = globalThis.fetch;
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('HttpClient', () => {
  const baseUrl = 'https://api.ministryplatform.com';
  const mockToken = 'test-access-token-123';
  const getToken = () => mockToken;
  let httpClient: HttpClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    httpClient = new HttpClient(baseUrl, getToken);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Error message sanitization', () => {
    // SECURITY regression: thrown messages propagate to ~40 console.error sites and
    // Node prints error.message verbatim, so a newline in the endpoint would let a
    // caller forge a second log line.
    it('refuses a newline-bearing endpoint before any request, without echoing it', async () => {
      const evil = '/files/X/1\nforged-log-line';

      const error = await httpClient.get(evil).catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Refusing unsafe MP API endpoint');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('keeps a non-JSON error out of the message and redacts file GUIDs', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });
      const guid = '0f8fad5b-d9cb-469f-a165-70867728950e';

      const error = await httpClient.get(`/files/${guid}/metadata`).catch((e: Error) => e);
      expect((error as Error).message).toBe('GET /files/{uniqueId}/metadata failed: 404 Not Found');
    });

    it('leaves a normal endpoint untouched in the message', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' });
      const error = await httpClient.get('/tables/Contacts').catch((e: Error) => e);
      expect((error as Error).message).toBe('GET /tables/Contacts failed: 500 Server Error');
    });

    it('does not alter the URL actually requested', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => '{}' });
      await httpClient.get('/tables/Contact_Log');
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.ministryplatform.com/tables/Contact_Log');
    });
  });

  describe('URL Building', () => {
    it('should build URL without query parameters', () => {
      const url = httpClient.buildUrl('/tables/Contacts');
      expect(url).toBe('https://api.ministryplatform.com/tables/Contacts');
    });

    it('should build URL with single query parameter', () => {
      const url = httpClient.buildUrl('/tables/Contacts', { $top: 10 });
      expect(url).toBe('https://api.ministryplatform.com/tables/Contacts?$top=10');
    });

    it('should build URL with multiple query parameters', () => {
      const url = httpClient.buildUrl('/tables/Contacts', {
        $top: 10,
        $skip: 20,
        $select: 'Contact_ID,Display_Name',
      });
      expect(url).toContain('$top=10');
      expect(url).toContain('$skip=20');
      expect(url).toContain('$select=Contact_ID%2CDisplay_Name');
    });

    it('should URL-encode special characters in query parameters', () => {
      const url = httpClient.buildUrl('/tables/Contacts', {
        $filter: "Last_Name LIKE 'Smith%'",
      });
      expect(url).toContain("$filter=Last_Name%20LIKE%20'Smith%25'");
    });

    it('should handle array query parameters', () => {
      const url = httpClient.buildUrl('/tables/Contact_Log', {
        id: [1, 2, 3],
      });
      expect(url).toContain('id=1');
      expect(url).toContain('id=2');
      expect(url).toContain('id=3');
    });

    it('should filter out undefined and null query parameters', () => {
      const url = httpClient.buildUrl('/tables/Contacts', {
        $top: 10,
        $skip: undefined,
        $filter: null,
      });
      expect(url).toBe('https://api.ministryplatform.com/tables/Contacts?$top=10');
    });

    it('should return base URL when all query params are undefined/null', () => {
      const url = httpClient.buildUrl('/tables/Contacts', {
        $top: undefined,
        $skip: null,
      });
      expect(url).toBe('https://api.ministryplatform.com/tables/Contacts');
    });

    it('should handle boolean query parameters', () => {
      const url = httpClient.buildUrl('/tables/Contacts', {
        $distinct: true,
      });
      expect(url).toBe('https://api.ministryplatform.com/tables/Contacts?$distinct=true');
    });
  });

  describe('GET Requests', () => {
    it('should make GET request with authorization header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([{ Contact_ID: 1, Display_Name: 'John Doe' }])),
      });

      const result = await httpClient.get('/tables/Contacts');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ministryplatform.com/tables/Contacts',
        {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer test-access-token-123',
            'Accept': 'application/json',
          },
          redirect: 'error',
          signal: expect.any(AbortSignal),
        }
      );
      expect(result).toEqual([{ Contact_ID: 1, Display_Name: 'John Doe' }]);
    });

    it('should make GET request with query parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([])),
      });

      await httpClient.get('/tables/Contacts', { $top: 10, $filter: 'Active=1' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('$top=10'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('$filter=Active%3D1'),
        expect.any(Object)
      );
    });

    it('should throw error on failed GET request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(httpClient.get('/tables/NonExistent')).rejects.toThrow(
        'GET /tables/NonExistent failed: 404 Not Found'
      );
    });

    it('should throw error on 401 Unauthorized', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(httpClient.get('/tables/Contacts')).rejects.toThrow(
        'GET /tables/Contacts failed: 401 Unauthorized'
      );
    });

    it('should throw error on 500 Internal Server Error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(httpClient.get('/tables/Contacts')).rejects.toThrow(
        'GET /tables/Contacts failed: 500 Internal Server Error'
      );
    });
  });

  describe('POST Requests', () => {
    it('should make POST request with JSON body', async () => {
      const newRecord = { First_Name: 'John', Last_Name: 'Doe' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([{ Contact_ID: 1, ...newRecord }])),
      });

      const result = await httpClient.post('/tables/Contacts', newRecord);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ministryplatform.com/tables/Contacts',
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-access-token-123',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(newRecord),
          redirect: 'error',
          signal: expect.any(AbortSignal),
        }
      );
      expect(result).toEqual([{ Contact_ID: 1, ...newRecord }]);
    });

    it('should make POST request without body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });

      await httpClient.post('/some/endpoint');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ministryplatform.com/some/endpoint',
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-access-token-123',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: undefined,
          redirect: 'error',
          signal: expect.any(AbortSignal),
        }
      );
    });

    it('should make POST request with query parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([])),
      });

      await httpClient.post('/tables/Contacts', { Name: 'Test' }, { $userId: 1 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('$userId=1'),
        expect.any(Object)
      );
    });

    it('should throw error on failed POST request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      await expect(
        httpClient.post('/tables/Contacts', { Invalid: 'data' })
      ).rejects.toThrow('POST /tables/Contacts failed: 400 Bad Request');
    });
  });

  describe('POST FormData Requests', () => {
    it('should make POST request with FormData', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['test']), 'test.txt');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ FileId: 1 })),
      });

      const result = await httpClient.postFormData('/files', formData);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ministryplatform.com/files',
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-access-token-123',
            'Accept': 'application/json',
            // No Content-Type for FormData
          },
          body: formData,
          redirect: 'error',
          signal: expect.any(AbortSignal),
        }
      );
      expect(result).toEqual({ FileId: 1 });
    });

    it('should throw error on failed FormData POST', async () => {
      const formData = new FormData();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 413,
        statusText: 'Payload Too Large',
      });

      await expect(httpClient.postFormData('/files', formData)).rejects.toThrow(
        'POST /files failed: 413 Payload Too Large'
      );
    });
  });

  describe('PUT Requests', () => {
    it('should make PUT request with JSON body', async () => {
      const updatedRecord = { Contact_ID: 1, First_Name: 'Jane' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([updatedRecord])),
      });

      const result = await httpClient.put('/tables/Contacts', updatedRecord);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ministryplatform.com/tables/Contacts',
        {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer test-access-token-123',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(updatedRecord),
          redirect: 'error',
          signal: expect.any(AbortSignal),
        }
      );
      expect(result).toEqual([updatedRecord]);
    });

    it('should throw error on failed PUT request with response body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Validation error: Field X is required'),
      });

      await expect(
        httpClient.put('/tables/Contacts', { Invalid: 'data' })
      ).rejects.toThrow('PUT /tables/Contacts failed: 400 Bad Request');
    });
  });

  describe('PUT FormData Requests', () => {
    it('should make PUT request with FormData', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['updated']), 'updated.txt');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ FileId: 1, FileName: 'updated.txt' })),
      });

      const result = await httpClient.putFormData('/files/1', formData);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ministryplatform.com/files/1',
        {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer test-access-token-123',
            'Accept': 'application/json',
          },
          body: formData,
          redirect: 'error',
          signal: expect.any(AbortSignal),
        }
      );
      expect(result).toEqual({ FileId: 1, FileName: 'updated.txt' });
    });
  });

  describe('DELETE Requests', () => {
    it('should make DELETE request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([{ Contact_ID: 1 }])),
      });

      const result = await httpClient.delete('/tables/Contacts', { id: [1] });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('id=1'),
        {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer test-access-token-123',
            'Accept': 'application/json',
          },
          redirect: 'error',
          signal: expect.any(AbortSignal),
        }
      );
      expect(result).toEqual([{ Contact_ID: 1 }]);
    });

    it('should throw error on failed DELETE request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(httpClient.delete('/tables/Contacts', { id: [1] })).rejects.toThrow(
        'DELETE /tables/Contacts failed: 403 Forbidden'
      );
    });
  });

  describe('Token Injection', () => {
    it('should use current token from getToken function', async () => {
      let currentToken = 'initial-token';
      const dynamicClient = new HttpClient(baseUrl, () => currentToken);

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([])),
      });

      await dynamicClient.get('/test');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer initial-token',
          }),
        })
      );

      // Update token
      currentToken = 'updated-token';

      await dynamicClient.get('/test');
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer updated-token',
          }),
        })
      );
    });
  });

  describe('Type Safety', () => {
    it('should return typed response from GET', async () => {
      interface Contact {
        Contact_ID: number;
        Display_Name: string;
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([{ Contact_ID: 1, Display_Name: 'Test' }])),
      });

      const result = await httpClient.get<Contact[]>('/tables/Contacts');

      expect(result[0].Contact_ID).toBe(1);
      expect(result[0].Display_Name).toBe('Test');
    });
  });

  // Batch 3 (audit N12, upstream MPNext 9b7b4d1): the endpoint is appended to the
  // service account's base URL, so anything that could leave the API root or
  // name a different path is refused before fetch, with a fixed message.
  describe('Endpoint path guard', () => {
    const mpBase = 'https://mp.example.com/ministryplatformapi';
    let mpClient: HttpClient;
    beforeEach(() => {
      mpClient = new HttpClient(mpBase, getToken);
    });

    it.each([
      ['a dot-segment', '/tables/..'],
      ['an encoded dot-segment (%2e%2e)', '/tables/%2e%2e'],
      ['an upper-case encoded dot (%2E)', '/tables/%2E%2E/procs'],
      ['an encoded slash (%2F)', '/tables/a%2Fb'],
      ['an encoded backslash (%5c)', '/tables/a%5cb'],
      ['a backslash', '/tables\\..\\procs'],
      ['a backslash without a dot-segment', '/tables\\Contacts'],
      ['a backslash in a file path', '/files\\1'],
      ['a query smuggled into the path', '/tables/Contacts?$filter=1=1'],
      ['a fragment', '/tables/Contacts#x'],
      ['a tab (the URL parser strips it, so .\t. becomes ..)', '/tables/.\t./procs'],
      ['a newline', '/tables/Contacts\n'],
      ['a DEL character', '/tables/Contacts\x7f'],
      ['no leading slash', 'tables/Contacts'],
      ['the empty string', ''],
    ])('refuses %s before fetch', async (_label, endpoint) => {
      await expect(mpClient.get(endpoint)).rejects.toThrow('Refusing unsafe MP API endpoint');
      expect(() => mpClient.buildUrl(endpoint)).toThrow('Refusing unsafe MP API endpoint');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('refuses a non-string endpoint (types are erased at runtime)', () => {
      expect(() => mpClient.buildUrl(42 as unknown as string)).toThrow('Refusing unsafe MP API endpoint');
    });

    it('never echoes the refused endpoint', async () => {
      const error = await mpClient.get('/tables/../SECRET-PATH').catch((e: Error) => e);
      expect((error as Error).message).not.toContain('SECRET-PATH');
    });

    it.each(['/tables/Contacts', '/tables/dp_Users', '/procs', '/files/123/metadata', '/files/Participant_Milestones/42', '/domain/filters', '/refreshMetadata'])(
      'accepts the real endpoint %s and keeps the base path',
      (endpoint) => {
        expect(mpClient.buildUrl(endpoint)).toBe(`${mpBase}${endpoint}`);
      }
    );

    it('checks every method, uploads included', async () => {
      const fd = new FormData();
      await expect(mpClient.post('/tables/..', {})).rejects.toThrow('Refusing unsafe');
      await expect(mpClient.put('/tables/..', {})).rejects.toThrow('Refusing unsafe');
      await expect(mpClient.delete('/tables/..')).rejects.toThrow('Refusing unsafe');
      await expect(mpClient.postFormData('/files/../x', fd)).rejects.toThrow('Refusing unsafe');
      await expect(mpClient.putFormData('/files/../x', fd)).rejects.toThrow('Refusing unsafe');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('reports an unparseable base URL with a fixed message', () => {
      const broken = new HttpClient('not a url', getToken);
      expect(() => broken.buildUrl('/tables/Contacts')).toThrow('Invalid MP API base URL');
    });
  });

  describe('Redirect refusal and timeouts', () => {
    const ok = () => ({ ok: true, text: () => Promise.resolve('[]') });

    it('sets redirect: "error" on every method', async () => {
      mockFetch.mockResolvedValue(ok());
      const fd = new FormData();
      await httpClient.get('/a');
      await httpClient.post('/a', { x: 1 });
      await httpClient.postFormData('/a', fd);
      await httpClient.put('/a', { x: 1 });
      await httpClient.putFormData('/a', fd);
      await httpClient.delete('/a');
      expect(mockFetch).toHaveBeenCalledTimes(6);
      for (const [, init] of mockFetch.mock.calls) {
        expect(init.redirect).toBe('error');
      }
    });

    it('surfaces a refused redirect (fetch TypeError) to the caller', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
      await expect(httpClient.get('/tables/Contacts')).rejects.toThrow(TypeError);
    });

    it('gives JSON calls the API timeout and multipart uploads the upload timeout', async () => {
      expect(MP_API_TIMEOUT_MS).toBe(30_000);
      expect(MP_UPLOAD_TIMEOUT_MS).toBe(60_000);
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
      mockFetch.mockResolvedValue(ok());
      const fd = new FormData();

      await httpClient.get('/a');
      await httpClient.post('/a', {});
      await httpClient.put('/a', {});
      await httpClient.delete('/a');
      expect(timeoutSpy.mock.calls.map(([ms]) => ms)).toEqual([30_000, 30_000, 30_000, 30_000]);

      timeoutSpy.mockClear();
      await httpClient.postFormData('/a', fd);
      await httpClient.putFormData('/a', fd);
      expect(timeoutSpy.mock.calls.map(([ms]) => ms)).toEqual([60_000, 60_000]);
    });
  });

  describe('Response body handling', () => {
    it.each(['get', 'delete'] as const)('%s returns undefined for a 204 without reading the body', async (method) => {
      const text = vi.fn();
      const json = vi.fn();
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204, text, json });
      await expect(httpClient[method]('/files/1')).resolves.toBeUndefined();
      expect(text).not.toHaveBeenCalled();
      expect(json).not.toHaveBeenCalled();
    });

    // Batch 3 review: an empty body without Content-Length (a chunked 200, or a
    // 205) threw "invalid JSON response" even though MP had succeeded.
    it.each([
      ['an empty-string 200', () => new Response('', { status: 200 })],
      ['a null-body 200', () => new Response(null, { status: 200 })],
      ['a 205', () => new Response(null, { status: 205 })],
      ['a whitespace-only 200', () => new Response(' \r\n', { status: 200 })],
    ])('returns undefined for %s (no Content-Length)', async (_label, make) => {
      const response = make();
      expect(response.headers.get('content-length')).toBeNull();
      mockFetch.mockResolvedValueOnce(response);
      await expect(httpClient.delete('/tables/Contacts')).resolves.toBeUndefined();
    });

    it('returns undefined for an empty chunked 200 from a real server', async () => {
      const server = createServer((_req, res) => {
        res.writeHead(200);
        res.end();
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as AddressInfo;
      try {
        let contentLength: string | null = 'unset';
        mockFetch.mockImplementationOnce(async (url: string, init: RequestInit) => {
          const response = await nodeFetch(url, init);
          contentLength = response.headers.get('content-length');
          return response;
        });
        const local = new HttpClient(`http://127.0.0.1:${port}`, getToken);
        await expect(local.delete('/tables/Contacts')).resolves.toBeUndefined();
        expect(contentLength).toBeNull();
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('lets a body-read failure through instead of calling it invalid JSON', async () => {
      const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.reject(timeout) });
      await expect(httpClient.get('/tables/Contacts')).rejects.toBe(timeout);
    });

    it('returns undefined for Content-Length: 0', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200, headers: { 'content-length': '0' } }));
      await expect(httpClient.put('/tables/Contacts', {})).resolves.toBeUndefined();
    });

    it('returns undefined for a real 204 Response', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
      await expect(httpClient.delete('/files/1')).resolves.toBeUndefined();
    });

    it('parses a real JSON Response', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('[{"Contact_ID":1}]', { status: 200, headers: { 'content-type': 'application/json' } })
      );
      await expect(httpClient.get('/tables/Contacts')).resolves.toEqual([{ Contact_ID: 1 }]);
    });

    it('does not check Content-Type (no outage on a JSON body labelled otherwise)', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('{"a":1}', { status: 200, headers: { 'content-type': 'text/plain' } })
      );
      await expect(httpClient.get('/domain')).resolves.toEqual({ a: 1 });
    });

    it.each([
      ['get', 'GET'],
      ['post', 'POST'],
      ['put', 'PUT'],
      ['delete', 'DELETE'],
    ] as const)('%s turns a non-JSON body into a fixed message that quotes none of it', async (method, verb) => {
      mockFetch.mockResolvedValueOnce(
        new Response('<html>member@example.org</html>', { status: 200, headers: { 'content-type': 'text/html' } })
      );
      const call =
        method === 'get' || method === 'delete'
          ? httpClient[method]('/tables/Contacts')
          : httpClient[method]('/tables/Contacts', {});
      const error = await call.catch((e: Error) => e);
      expect((error as Error).message).toBe(`${verb} /tables/Contacts failed: invalid JSON response`);
      expect((error as Error).message).not.toContain('member@example.org');
    });

    it('redacts a file GUID in the invalid-JSON message too', async () => {
      mockFetch.mockResolvedValueOnce(new Response('x', { status: 200 }));
      const error = await httpClient
        .get('/files/0a1b2c3d-1111-2222-3333-444455556666/metadata')
        .catch((e: Error) => e);
      expect((error as Error).message).toBe('GET /files/{uniqueId}/metadata failed: invalid JSON response');
    });

    it('uploads turn a non-JSON body into the fixed message too', async () => {
      mockFetch.mockResolvedValueOnce(new Response('not json', { status: 200 }));
      await expect(httpClient.postFormData('/files/Contacts/1', new FormData())).rejects.toThrow(
        'POST /files/Contacts/1 failed: invalid JSON response'
      );
      mockFetch.mockResolvedValueOnce(new Response('not json', { status: 200 }));
      await expect(httpClient.putFormData('/files/1', new FormData())).rejects.toThrow(
        'PUT /files/1 failed: invalid JSON response'
      );
    });
  });
});
