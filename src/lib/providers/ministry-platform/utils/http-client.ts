import { QueryParams, RequestBody } from "../types/provider.types";
import { MP_API_TIMEOUT_MS, MP_UPLOAD_TIMEOUT_MS } from "./timeouts";

/**
 * MP file unique IDs are GUIDs, and MP serves /files/{uniqueId} without
 * authentication, so the ID is a download capability: keep it out of error
 * messages, which every caller logs (upstream MPNext 9b7b4d1).
 */
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Strip CR/LF and other control characters from an endpoint before it is
 * interpolated into an error message or a log line.
 *
 * The thrown errors below propagate to ~40 `console.error` sites, and Node's
 * console prints `error.message` verbatim — so a newline embedded in an endpoint
 * lets a caller forge a second log line. `assertSafeEndpoint` now refuses such an
 * endpoint before any request, so this is a second net for the messages. GUIDs
 * are replaced with `{uniqueId}` (see GUID above).
 */
function safeEndpoint(endpoint: string): string {
    return String(endpoint).replace(/[\r\n\x00-\x1f\x7f]/g, "").replace(GUID, "{uniqueId}");
}

/**
 * Endpoint content that could re-aim the service bearer at another API path once
 * the URL parser runs: dot-segments, a query or fragment smuggled into the path,
 * backslashes (treated as "/" for http(s)), their percent-encoded forms, and
 * control characters (the parser silently strips tabs and newlines, so ".\t."
 * would become ".."). Upstream MPNext 9b7b4d1.
 */
const UNSAFE_ENDPOINT = /\.\.|[?#\\]|%2e|%2f|%5c|[\u0000-\u001f\u007f]/i;

const UNSAFE_ENDPOINT_MESSAGE = "Refusing unsafe MP API endpoint";

/**
 * Parses a successful response body as JSON.
 *
 * - A 204, or any empty (or whitespace-only) body, yields `undefined`: a
 *   successful delete or metadata refresh may answer with no body, and an empty
 *   chunked 200 carries no Content-Length to say so. `response.json()` threw on
 *   all of these.
 * - A body that is not JSON throws a fixed message. V8's `SyntaxError` quotes a
 *   fragment of the body, and every caller logs the error. A failure while
 *   reading the body (a timeout, a dropped connection) propagates as it is: it
 *   quotes no body, and calling it "invalid JSON" would mislead.
 *
 * Deliberately no Content-Type check: an MP endpoint answering 200 JSON with an
 * unexpected type would turn into an outage for no security gain.
 */
async function readJson<T>(response: Response, method: string, endpoint: string): Promise<T> {
    if (response.status === 204) {
        return undefined as T;
    }
    const text = await response.text();
    if (text.trim() === '') {
        return undefined as T;
    }
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new Error(`${method} ${safeEndpoint(endpoint)} failed: invalid JSON response`);
    }
}

/*
 * Every fetch below sets `redirect: 'error'`. MP's API never redirects, and a
 * followed 307/308 would re-send the service bearer and the request body (member
 * data, uploaded files) to wherever the Location header points. A refused
 * redirect rejects with a TypeError, which the caller's catch logs and rethrows
 * (errorForLog names it: "TypeError: fetch failed (cause: Error redirect refused)").
 */

export class HttpClient {
    private baseUrl: string;
    private getToken: () => string;

    constructor(baseUrl: string, getToken: () => string) {
        this.baseUrl = baseUrl;
        this.getToken = getToken;
    }

    async get<T = unknown>(endpoint: string, queryParams?: QueryParams): Promise<T> {
        const url = this.buildUrl(endpoint, queryParams);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.getToken()}`,
                'Accept': 'application/json'
            },
            redirect: 'error',
            signal: AbortSignal.timeout(MP_API_TIMEOUT_MS)
        });

        if (!response.ok) {
            // SECURITY (F5/F6): never put the response body in the thrown error, in
            // ANY environment. MP echoes the request — including $filter values such
            // as searched emails, phones, GUIDs and dates of birth — back in error
            // bodies, and this message propagates to every caller's console.error.
            // A dev-gated dump was removed in the F5 pass: it still ran on any
            // machine where NODE_ENV was not 'production'. Status, statusText and
            // the sanitized endpoint are enough to debug a failure.
            throw new Error(`GET ${safeEndpoint(endpoint)} failed: ${response.status} ${response.statusText}`);
        }

        return await readJson<T>(response, 'GET', endpoint);
    }

    async post<T = unknown>(endpoint: string, body?: RequestBody, queryParams?: QueryParams): Promise<T> {
        const url = this.buildUrl(endpoint, queryParams);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.getToken()}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: body ? JSON.stringify(body) : undefined,
            redirect: 'error',
            signal: AbortSignal.timeout(MP_API_TIMEOUT_MS)
        });

        if (!response.ok) {
            throw new Error(`POST ${safeEndpoint(endpoint)} failed: ${response.status} ${response.statusText}`);
        }

        return await readJson<T>(response, 'POST', endpoint);
    }

    async postFormData<T = unknown>(endpoint: string, formData: FormData, queryParams?: QueryParams): Promise<T> {
        const url = this.buildUrl(endpoint, queryParams);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.getToken()}`,
                'Accept': 'application/json'
                // Don't set Content-Type for FormData
            },
            body: formData,
            redirect: 'error',
            signal: AbortSignal.timeout(MP_UPLOAD_TIMEOUT_MS)
        });

        if (!response.ok) {
            throw new Error(`POST ${safeEndpoint(endpoint)} failed: ${response.status} ${response.statusText}`);
        }

        return await readJson<T>(response, 'POST', endpoint);
    }

    async put<T = unknown>(endpoint: string, body: RequestBody, queryParams?: QueryParams): Promise<T> {
        const url = this.buildUrl(endpoint, queryParams);

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${this.getToken()}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(body),
            redirect: 'error',
            signal: AbortSignal.timeout(MP_API_TIMEOUT_MS)
        });

        if (!response.ok) {
            throw new Error(`PUT ${safeEndpoint(endpoint)} failed: ${response.status} ${response.statusText}`);
        }

        return await readJson<T>(response, 'PUT', endpoint);
    }

    async putFormData<T = unknown>(endpoint: string, formData: FormData, queryParams?: QueryParams): Promise<T> {
        const url = this.buildUrl(endpoint, queryParams);
        
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${this.getToken()}`,
                'Accept': 'application/json'
                // Don't set Content-Type for FormData
            },
            body: formData,
            redirect: 'error',
            signal: AbortSignal.timeout(MP_UPLOAD_TIMEOUT_MS)
        });

        if (!response.ok) {
            throw new Error(`PUT ${safeEndpoint(endpoint)} failed: ${response.status} ${response.statusText}`);
        }

        return await readJson<T>(response, 'PUT', endpoint);
    }

    async delete<T = unknown>(endpoint: string, queryParams?: QueryParams): Promise<T> {
        const url = this.buildUrl(endpoint, queryParams);
        
        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${this.getToken()}`,
                'Accept': 'application/json'
            },
            redirect: 'error',
            signal: AbortSignal.timeout(MP_API_TIMEOUT_MS)
        });

        if (!response.ok) {
            throw new Error(`DELETE ${safeEndpoint(endpoint)} failed: ${response.status} ${response.statusText}`);
        }

        return await readJson<T>(response, 'DELETE', endpoint);
    }

    public buildUrl(endpoint: string, queryParams?: QueryParams): string {
        this.assertSafeEndpoint(endpoint);
        const url = `${this.baseUrl}${endpoint}`;
        if (!queryParams) return url;

        const queryString = this.buildQueryString(queryParams);
        return queryString ? `${url}?${queryString}` : url;
    }

    /**
     * Central path guard (upstream MPNext 9b7b4d1). The endpoint is appended to
     * the service account's base URL and sent with its bearer, so it must not be
     * able to leave the API root or name a different API path than it appears
     * to. Callers encodeURIComponent their segments, but
     * encodeURIComponent("..") === "..", so the check has to live here. Runs
     * before any fetch; the message never echoes the endpoint.
     */
    private assertSafeEndpoint(endpoint: string): void {
        // Runtime check: types are erased, and endpoints can carry caller input.
        if (typeof endpoint !== 'string' || !endpoint.startsWith('/') || UNSAFE_ENDPOINT.test(endpoint)) {
            throw new Error(UNSAFE_ENDPOINT_MESSAGE);
        }

        let resolved: string;
        let root: string;
        try {
            root = new URL(this.baseUrl).href.replace(/\/+$/, '') + '/';
            resolved = new URL(`${this.baseUrl}${endpoint}`).href;
        } catch {
            throw new Error('Invalid MP API base URL');
        }
        // Defensive: the checks above already rule out every known way out.
        if (!resolved.startsWith(root)) {
            throw new Error(UNSAFE_ENDPOINT_MESSAGE);
        }
    }

    private buildQueryString(params: QueryParams): string {
        return Object.entries(params)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => {
                if (Array.isArray(value)) {
                    return value.map(v => `${key}=${encodeURIComponent(String(v))}`).join('&');
                }
                return `${key}=${encodeURIComponent(String(value))}`;
            })
            .join('&');
    }
}