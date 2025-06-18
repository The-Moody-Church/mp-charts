import { getClientCredentialsToken } from "../clientCredentials";
import { HttpClient } from "../utils/httpClient";

const TOKEN_LIFE = 5 * 60 * 1000; // 5 minutes

export class MinistryPlatformClient {
    private token: string = "";
    private expiresAt: Date = new Date(0);
    private baseUrl: string;
    private httpClient: HttpClient;

    constructor() {
        this.baseUrl = process.env.MINISTRY_PLATFORM_BASE_URL!;
        this.httpClient = new HttpClient(this.baseUrl, () => this.token);
    }

    /**
     * Ensures the authentication token is valid
     */
    public async ensureValidToken(): Promise<void> {
        console.log("Checking token validity...");
        console.log("Expires at: ", this.expiresAt);
        console.log("Current time: ", new Date());

        if (this.expiresAt < new Date()) {
            console.log("Token expired, refreshing...");
            const creds = await getClientCredentialsToken();
            this.token = creds.access_token;
            this.expiresAt = new Date(Date.now() + TOKEN_LIFE);
            console.log("Token refreshed. Expires at: ", this.expiresAt);
        }
    }

    /**
     * Get the HTTP client instance
     */
    public getHttpClient(): HttpClient {
        return this.httpClient;
    }
}