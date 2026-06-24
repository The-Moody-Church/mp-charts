import { QueryParams, RequestBody } from "../types/provider.types";

/**
 * Abort outbound MP requests that hang. Without an upper bound, a slow or stuck
 * upstream can pin the shared service-account request path indefinitely (F13).
 */
const REQUEST_TIMEOUT_MS = 30_000;

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
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });

        if (!response.ok) {
            // SECURITY (F6): never put the response body in the thrown error. MP echoes
            // the request (including $filter values such as searched emails/phones/
            // GUIDs/DOB) in error bodies, and this message propagates to ~40
            // console.error sites — it would leak PII to production logs. In
            // development only, surface the body to aid debugging.
            if (process.env.NODE_ENV === 'development') {
                try {
                    const errorBody = await response.text();
                    if (errorBody) console.warn(`[MP GET ${endpoint}] error body:`, errorBody);
                } catch {
                    // ignore — body is best-effort in dev
                }
            }
            throw new Error(`GET ${endpoint} failed: ${response.status} ${response.statusText}`);
        }

        return await response.json() as T;
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
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });

        if (!response.ok) {
            throw new Error(`POST ${endpoint} failed: ${response.status} ${response.statusText}`);
        }

        return await response.json() as T;
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
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });

        if (!response.ok) {
            throw new Error(`POST ${endpoint} failed: ${response.status} ${response.statusText}`);
        }

        return await response.json() as T;
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
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });

        if (!response.ok) {
            throw new Error(`PUT ${endpoint} failed: ${response.status} ${response.statusText}`);
        }

        return await response.json() as T;
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
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });

        if (!response.ok) {
            throw new Error(`PUT ${endpoint} failed: ${response.status} ${response.statusText}`);
        }

        return await response.json() as T;
    }

    async delete<T = unknown>(endpoint: string, queryParams?: QueryParams): Promise<T> {
        const url = this.buildUrl(endpoint, queryParams);
        
        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${this.getToken()}`,
                'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });

        if (!response.ok) {
            throw new Error(`DELETE ${endpoint} failed: ${response.status} ${response.statusText}`);
        }

        return await response.json() as T;
    }

    public buildUrl(endpoint: string, queryParams?: QueryParams): string {
        const url = `${this.baseUrl}${endpoint}`;
        if (!queryParams) return url;

        const queryString = this.buildQueryString(queryParams);
        return queryString ? `${url}?${queryString}` : url;
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