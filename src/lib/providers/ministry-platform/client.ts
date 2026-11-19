import { getMpBaseUrl } from "@/lib/env";
import { errorForLog } from "@/lib/log-safe";
import { getClientCredentialsToken } from "./auth/client-credentials";
import { HttpClient } from "./utils/http-client";

// Refresh this far ahead of the token's real expiration, so a request that is
// already in flight never races the expiry boundary.
const TOKEN_SAFETY_MARGIN = 5 * 60 * 1000; // 5 minutes

// Used when the token response omits expires_in. MP client-credentials tokens
// are issued with a 1 hour lifetime.
const DEFAULT_TOKEN_LIFETIME_SECONDS = 3600;

// Floor on usable token life, so a pathologically short expires_in cannot drive
// a refresh storm (or, after subtracting the margin, go negative).
const MIN_TOKEN_LIFETIME = 30 * 1000; // 30 seconds

// Ceiling on the reported lifetime (upstream MPNext 5aa0b5e). An absurd
// expires_in such as 1e13 used to produce an Invalid Date, which compares as
// never expired, so the token was never refreshed again.
const MAX_TOKEN_LIFETIME_SECONDS = 3600;

export interface MinistryPlatformClientOptions {
    /** Pre-authenticated user access token (from OIDC session). When provided,
     *  the client uses this token directly instead of client_credentials flow. */
    accessToken?: string;
}

/**
 * MinistryPlatformClient - Core HTTP client with automatic authentication management
 *
 * Manages OAuth2 authentication and provides a configured HttpClient instance for all
 * Ministry Platform API operations. Supports two authentication modes:
 *
 * 1. **Client credentials** (default) — uses MINISTRY_PLATFORM_CLIENT_ID/SECRET to obtain
 *    a token via the client_credentials grant. All API calls run as the API Client User.
 *
 * 2. **User access token** — uses a pre-authenticated token from the user's OIDC session.
 *    API calls run as the logged-in user, respecting their MP permissions and producing
 *    accurate audit logs. Token refresh is handled by NextAuth (auth.ts), not this client.
 */
export class MinistryPlatformClient {
    private token: string = ""; // Current access token
    private expiresAt: Date = new Date(0); // Token expiration time (initialized to epoch to force refresh)
    private baseUrl: string; // Ministry Platform instance base URL
    private httpClient: HttpClient; // HTTP client instance with token injection
    private isUserToken: boolean = false; // Whether using a user access token (vs. client credentials)
    private inflight: Promise<void> | null = null; // One refresh shared by concurrent callers

    /**
     * Creates a new MinistryPlatformClient instance
     * @param options Optional configuration. Pass `accessToken` to use the user's OIDC token
     *               instead of client credentials.
     */
    constructor(options?: MinistryPlatformClientOptions) {
        // Validated base URL (https, no credentials/query, no trailing slash;
        // src/lib/env.ts). Throws on an unset or unusable value.
        this.baseUrl = getMpBaseUrl();

        if (options?.accessToken) {
            // User token mode: use the pre-authenticated token directly.
            // Token refresh is managed by NextAuth's JWT callback, not by this client.
            this.token = options.accessToken;
            this.expiresAt = new Date(Date.now() + 60 * 60 * 1000); // Trust auth.ts to keep it fresh
            this.isUserToken = true;
        }

        // Create HTTP client with token getter function for automatic authentication
        this.httpClient = new HttpClient(this.baseUrl, () => this.token);
    }

    /**
     * Ensures the authentication token is valid and refreshes if necessary.
     * In user-token mode this is a no-op — NextAuth manages the token lifecycle.
     * @throws Error if token refresh fails (client credentials mode only)
     */
    public async ensureValidToken(): Promise<void> {
        // User tokens are managed by auth.ts JWT callback — nothing to do here
        if (this.isUserToken) return;

        // Token still inside its usable life
        if (this.expiresAt >= new Date()) return;

        // Single-flight (audit N12, upstream MPNext 5aa0b5e): every caller that
        // finds the token expired shares one refresh. Without it a cold
        // dashboard load (~31 parallel MP calls) made ~31 token POSTs, and so
        // did every expiry boundary. A rejected refresh rejects every waiter,
        // and `finally` clears the slot so the next call tries again.
        if (!this.inflight) {
            this.inflight = this.refreshToken().finally(() => {
                this.inflight = null;
            });
        }
        return this.inflight;
    }

    private async refreshToken(): Promise<void> {
        try {
            // Get new access token using client credentials flow (validated
            // there: a non-empty string access_token)
            const creds = await getClientCredentialsToken();
            this.token = creds.access_token;

            // Expire the token TOKEN_SAFETY_MARGIN before the lifetime the
            // server reported, clamped to [MIN_TOKEN_LIFETIME,
            // MAX_TOKEN_LIFETIME_SECONDS]; an absent, non-numeric, zero or
            // negative value uses the default. Never sooner than
            // MIN_TOKEN_LIFETIME from now.
            const seconds = Number(creds.expires_in);
            const lifetimeSeconds =
                Number.isFinite(seconds) && seconds > 0
                    ? Math.min(Math.max(seconds, MIN_TOKEN_LIFETIME / 1000), MAX_TOKEN_LIFETIME_SECONDS)
                    : DEFAULT_TOKEN_LIFETIME_SECONDS;
            this.expiresAt = new Date(
                Date.now() + Math.max(lifetimeSeconds * 1000 - TOKEN_SAFETY_MARGIN, MIN_TOKEN_LIFETIME)
            );
        } catch (error) {
            console.error("Failed to refresh MP access token:", errorForLog(error));
            throw error;
        }
    }

    /**
     * Returns the configured HTTP client instance for making authenticated requests
     * @returns HttpClient instance with automatic token injection
     */
    public getHttpClient(): HttpClient {
        return this.httpClient;
    }
}