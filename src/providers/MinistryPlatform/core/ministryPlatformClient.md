# MinistryPlatformClient - Core HTTP Client with Authentication

## Overview

The `MinistryPlatformClient` class serves as the core HTTP client for all Ministry Platform API operations. It manages OAuth2 authentication, token lifecycle, and provides a configured HttpClient instance to all service classes.

## Class Structure

```typescript
export class MinistryPlatformClient {
    private token: string = "";
    private expiresAt: Date = new Date(0);
    private baseUrl: string;
    private httpClient: HttpClient;
    
    constructor()
}
```

## Constants

```typescript
const TOKEN_LIFE = 5 * 60 * 1000; // 5 minutes
```

**Purpose**: Defines the token lifetime in milliseconds. Tokens are refreshed 5 minutes before their actual expiration to ensure continuous API access.

## Constructor

```typescript
constructor() {
    this.baseUrl = process.env.MINISTRY_PLATFORM_BASE_URL!;
    this.httpClient = new HttpClient(this.baseUrl, () => this.token);
}
```

**Initialization Process**:
1. Sets the base URL from environment variable
2. Creates HttpClient instance with token getter function
3. Initializes token expiration to epoch (forces immediate refresh)

**Environment Variables Required**:
- `MINISTRY_PLATFORM_BASE_URL`: The base URL for your Ministry Platform instance

## Methods

### ensureValidToken

```typescript
public async ensureValidToken(): Promise<void>
```

**Purpose**: Ensures the authentication token is valid and refreshes it if necessary

**Process**:
1. Checks if current token is expired
2. If expired, requests new token using client credentials
3. Updates token and expiration time
4. Provides comprehensive logging for debugging

**Example Usage**:
```typescript
// Always call before making API requests
await this.client.ensureValidToken();
const data = await this.client.getHttpClient().get('/tables/Contacts');
```

**Logging Output**:
```
Checking token validity...
Expires at: 2024-01-15T10:30:00.000Z
Current time: 2024-01-15T10:25:00.000Z
Token expired, refreshing...
Token refreshed. Expires at: 2024-01-15T10:35:00.000Z
```

**Error Handling**:
- Throws errors from `getClientCredentialsToken()` if authentication fails
- Logs all token lifecycle events for debugging

### getHttpClient

```typescript
public getHttpClient(): HttpClient
```

**Purpose**: Returns the configured HttpClient instance

**Returns**: HttpClient instance with automatic token injection

**Example Usage**:
```typescript
const httpClient = this.client.getHttpClient();
const contacts = await httpClient.get<Contact[]>('/tables/Contacts');
```

## Token Management

### Token Lifecycle

1. **Initial State**: Token is empty, expiration is set to epoch
2. **First Request**: `ensureValidToken()` detects expired token and requests new one
3. **Subsequent Requests**: Token is reused until 5 minutes before expiration
4. **Refresh**: New token is requested automatically when needed

### Token Refresh Logic

```typescript
if (this.expiresAt < new Date()) {
    console.log("Token expired, refreshing...");
    const creds = await getClientCredentialsToken();
    this.token = creds.access_token;
    this.expiresAt = new Date(Date.now() + TOKEN_LIFE);
}
```

**Key Features**:
- Proactive refresh (5 minutes before expiration)
- Automatic retry on expired tokens
- Comprehensive logging for debugging
- Thread-safe token management

## Integration with Services

All service classes receive the MinistryPlatformClient instance in their constructor:

```typescript
export class TableService {
    private client: MinistryPlatformClient;

    constructor(client: MinistryPlatformClient) {
        this.client = client;
    }

    public async getTableRecords<T>(table: string, params?: TableQueryParams): Promise<T[]> {
        // Always ensure token is valid before making requests
        await this.client.ensureValidToken();
        
        const endpoint = `/tables/${encodeURIComponent(table)}`;
        return await this.client.getHttpClient().get<T[]>(endpoint, params);
    }
}
```

## Usage Examples

### Basic Service Implementation

```typescript
export class CustomService {
    private client: MinistryPlatformClient;

    constructor(client: MinistryPlatformClient) {
        this.client = client;
    }

    public async getData<T>(endpoint: string): Promise<T> {
        try {
            // Always ensure token is valid
            await this.client.ensureValidToken();
            
            // Get the HTTP client and make the request
            const httpClient = this.client.getHttpClient();
            return await httpClient.get<T>(endpoint);
        } catch (error) {
            console.error(`Error getting data from ${endpoint}:`, error);
            throw error;
        }
    }
}
```

### Error Handling Pattern

```typescript
public async makeRequest<T>(endpoint: string): Promise<T> {
    try {
        await this.client.ensureValidToken();
        return await this.client.getHttpClient().get<T>(endpoint);
    } catch (error) {
        // Handle authentication errors
        if (error.message.includes('401')) {
            console.error('Authentication failed, token may be invalid');
            // Could implement retry logic here
        }
        
        // Handle other HTTP errors
        if (error.message.includes('400')) {
            console.error('Bad request, check parameters');
        }
        
        throw error;
    }
}
```

## Environment Configuration

### Required Environment Variables

```env
# Ministry Platform instance base URL
MINISTRY_PLATFORM_BASE_URL=https://your-instance.ministryplatform.com

# OAuth2 Client Credentials (used by getClientCredentialsToken)
MINISTRY_PLATFORM_CLIENT_ID=your_client_id
MINISTRY_PLATFORM_CLIENT_SECRET=your_client_secret
```

### Configuration Validation

```typescript
// Add validation in constructor if needed
constructor() {
    if (!process.env.MINISTRY_PLATFORM_BASE_URL) {
        throw new Error('MINISTRY_PLATFORM_BASE_URL environment variable is required');
    }
    
    this.baseUrl = process.env.MINISTRY_PLATFORM_BASE_URL;
    this.httpClient = new HttpClient(this.baseUrl, () => this.token);
}
```

## Debugging and Monitoring

### Token Logging

The client provides detailed token lifecycle logging:

```typescript
console.log("Checking token validity...");
console.log("Expires at: ", this.expiresAt);
console.log("Current time: ", new Date());
console.log("Token expired, refreshing...");
console.log("Token refreshed. Expires at: ", this.expiresAt);
```

### Custom Logging

```typescript
public async ensureValidToken(): Promise<void> {
    const now = new Date();
    const timeUntilExpiry = this.expiresAt.getTime() - now.getTime();
    
    console.log(`Token check: ${timeUntilExpiry}ms until expiry`);
    
    if (this.expiresAt < now) {
        console.log("Refreshing token...");
        const startTime = Date.now();
        
        try {
            const creds = await getClientCredentialsToken();
            this.token = creds.access_token;
            this.expiresAt = new Date(Date.now() + TOKEN_LIFE);
            
            const duration = Date.now() - startTime;
            console.log(`Token refreshed successfully in ${duration}ms`);
        } catch (error) {
            console.error("Token refresh failed:", error);
            throw error;
        }
    }
}
```

## Best Practices

### 1. Always Check Token Before Requests

```typescript
// ✅ Good
await this.client.ensureValidToken();
const data = await this.client.getHttpClient().get('/endpoint');

// ❌ Bad - might fail with expired token
const data = await this.client.getHttpClient().get('/endpoint');
```

### 2. Handle Token Refresh Errors

```typescript
try {
    await this.client.ensureValidToken();
    // Make API request
} catch (error) {
    if (error.message.includes('Failed to get client credentials token')) {
        // Handle authentication configuration issues
        console.error('Check client credentials configuration');
    }
    throw error;
}
```

### 3. Use Proper Error Handling

```typescript
public async serviceMethod(): Promise<Data> {
    try {
        await this.client.ensureValidToken();
        return await this.client.getHttpClient().get<Data>('/endpoint');
    } catch (error) {
        console.error('Service method failed:', error);
        throw error; // Re-throw to allow caller to handle
    }
}
```

### 4. Implement Retry Logic for Transient Failures

```typescript
public async makeRequestWithRetry<T>(endpoint: string, maxRetries = 3): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await this.client.ensureValidToken();
            return await this.client.getHttpClient().get<T>(endpoint);
        } catch (error) {
            if (attempt === maxRetries) {
                throw error;
            }
            
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
    
    throw new Error('Max retries exceeded');
}
```

## Common Issues and Solutions

### 1. Token Refresh Failures

**Issue**: `getClientCredentialsToken()` throws errors

**Solutions**:
- Verify environment variables are set correctly
- Check client ID and secret are valid
- Ensure Ministry Platform instance is accessible
- Verify OAuth2 configuration in Ministry Platform

### 2. Frequent Token Refreshes

**Issue**: Token is refreshed on every request

**Solutions**:
- Check system clock is accurate
- Verify TOKEN_LIFE constant is appropriate
- Ensure token expiration calculation is correct

### 3. Concurrent Request Issues

**Issue**: Multiple requests trigger simultaneous token refreshes

**Solutions**:
- Implement token refresh locking
- Use promise caching for token requests
- Consider singleton pattern for token management

## Integration Points

### With HttpClient

```typescript
// HttpClient receives token via callback
this.httpClient = new HttpClient(this.baseUrl, () => this.token);

// Token is automatically injected into all requests
const response = await this.httpClient.get('/endpoint');
```

### With Services

```typescript
// All services receive the client instance
export class ministryPlatformProvider {
    constructor() {
        this.client = new MinistryPlatformClient();
        this.tableService = new TableService(this.client);
        this.procedureService = new ProcedureService(this.client);
        // ... other services
    }
}
```

### With Client Credentials

```typescript
// Depends on clientCredentials module for token acquisition
const creds = await getClientCredentialsToken();
this.token = creds.access_token;
```

This client serves as the foundation for all Ministry Platform API operations, providing reliable authentication and HTTP communication services to the entire provider system.
