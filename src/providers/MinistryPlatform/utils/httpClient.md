# HttpClient - Low-Level HTTP Operations

## Overview

The `HttpClient` class provides low-level HTTP operations for communicating with the Ministry Platform API. It handles request/response cycles, authentication headers, query parameter serialization, and error handling.

## Class Structure

```typescript
export class HttpClient {
    private baseUrl: string;
    private getToken: () => string;
    
    constructor(baseUrl: string, getToken: () => string)
}
```

## Constructor Parameters

- **baseUrl**: The base URL for the Ministry Platform API (e.g., `https://your-instance.ministryplatform.com`)
- **getToken**: A function that returns the current authentication token

## Methods

### GET Requests

```typescript
async get<T = unknown>(endpoint: string, queryParams?: QueryParams): Promise<T>
```

**Purpose**: Performs HTTP GET requests with automatic authentication

**Parameters**:
- `endpoint`: API endpoint path (e.g., `/tables/Contacts`)
- `queryParams`: Optional query parameters object

**Returns**: Parsed JSON response typed as `T`

**Example**:
```typescript
const contacts = await httpClient.get<Contact[]>('/tables/Contacts', {
  $filter: 'Contact_Status_ID=1',
  $select: 'Contact_ID,Display_Name',
  $top: 50
});
```

**Headers Set**:
- `Authorization: Bearer ${token}`
- `Accept: application/json`

### POST Requests

```typescript
async post<T = unknown>(endpoint: string, body?: RequestBody, queryParams?: QueryParams): Promise<T>
```

**Purpose**: Performs HTTP POST requests with JSON body

**Parameters**:
- `endpoint`: API endpoint path
- `body`: Optional request body object
- `queryParams`: Optional query parameters

**Returns**: Parsed JSON response typed as `T`

**Example**:
```typescript
const newContact = await httpClient.post<Contact>('/tables/Contacts', {
  First_Name: 'John',
  Last_Name: 'Doe',
  Email_Address: 'john@example.com'
});
```

**Headers Set**:
- `Authorization: Bearer ${token}`
- `Content-Type: application/json`
- `Accept: application/json`

### POST with Form Data

```typescript
async postFormData<T = unknown>(endpoint: string, formData: FormData, queryParams?: QueryParams): Promise<T>
```

**Purpose**: Performs HTTP POST requests with multipart form data (for file uploads)

**Parameters**:
- `endpoint`: API endpoint path
- `formData`: FormData object containing files and data
- `queryParams`: Optional query parameters

**Returns**: Parsed JSON response typed as `T`

**Example**:
```typescript
const formData = new FormData();
formData.append('file-0', file, file.name);
formData.append('description', 'Profile photo');

const uploadResult = await httpClient.postFormData<FileDescription[]>(
  '/files/Contacts/12345',
  formData
);
```

**Headers Set**:
- `Authorization: Bearer ${token}`
- `Accept: application/json`
- Content-Type is automatically set by the browser for FormData

### PUT Requests

```typescript
async put<T = unknown>(endpoint: string, body: RequestBody, queryParams?: QueryParams): Promise<T>
```

**Purpose**: Performs HTTP PUT requests for updating resources

**Parameters**:
- `endpoint`: API endpoint path
- `body`: Request body object (required for PUT)
- `queryParams`: Optional query parameters

**Returns**: Parsed JSON response typed as `T`

**Example**:
```typescript
const updatedContact = await httpClient.put<Contact>('/tables/Contacts', {
  Contact_ID: 12345,
  First_Name: 'John',
  Last_Name: 'Smith',
  Email_Address: 'john.smith@example.com'
});
```

**Headers Set**:
- `Authorization: Bearer ${token}`
- `Content-Type: application/json`
- `Accept: application/json`

### PUT with Form Data

```typescript
async putFormData<T = unknown>(endpoint: string, formData: FormData, queryParams?: QueryParams): Promise<T>
```

**Purpose**: Performs HTTP PUT requests with multipart form data (for file updates)

**Parameters**:
- `endpoint`: API endpoint path
- `formData`: FormData object containing files and data
- `queryParams`: Optional query parameters

**Returns**: Parsed JSON response typed as `T`

**Example**:
```typescript
const formData = new FormData();
formData.append('file', newFile, newFile.name);
formData.append('description', 'Updated profile photo');

const updateResult = await httpClient.putFormData<FileDescription>(
  '/files/67890',
  formData
);
```

### DELETE Requests

```typescript
async delete<T = unknown>(endpoint: string, queryParams?: QueryParams): Promise<T>
```

**Purpose**: Performs HTTP DELETE requests

**Parameters**:
- `endpoint`: API endpoint path
- `queryParams`: Optional query parameters (often contains IDs to delete)

**Returns**: Parsed JSON response typed as `T`

**Example**:
```typescript
const deletedContacts = await httpClient.delete<Contact[]>('/tables/Contacts', {
  id: [12345, 67890],
  $userId: 1
});
```

**Headers Set**:
- `Authorization: Bearer ${token}`
- `Accept: application/json`

## Utility Methods

### buildUrl

```typescript
public buildUrl(endpoint: string, queryParams?: QueryParams): string
```

**Purpose**: Constructs full URLs with query parameters

**Parameters**:
- `endpoint`: API endpoint path
- `queryParams`: Optional query parameters object

**Returns**: Complete URL string

**Example**:
```typescript
const url = httpClient.buildUrl('/tables/Contacts', {
  $filter: 'Contact_Status_ID=1',
  $select: 'Contact_ID,Display_Name'
});
// Returns: https://your-instance.ministryplatform.com/tables/Contacts?$filter=Contact_Status_ID%3D1&$select=Contact_ID%2CDisplay_Name
```

### buildQueryString (Private)

```typescript
private buildQueryString(params: QueryParams): string
```

**Purpose**: Converts query parameters object to URL-encoded string

**Features**:
- Handles arrays by repeating the parameter name
- URL-encodes all values
- Filters out null/undefined values
- Proper formatting for Ministry Platform API

**Example**:
```typescript
// Input: { $filter: 'Name=John', ids: [1, 2, 3], $top: 10 }
// Output: "$filter=Name%3DJohn&ids=1&ids=2&ids=3&$top=10"
```

## Error Handling

All HTTP methods include comprehensive error handling:

```typescript
if (!response.ok) {
    throw new Error(`${METHOD} ${endpoint} failed: ${response.status} ${response.statusText}`);
}
```

**Error Information Included**:
- HTTP method used
- Endpoint that failed
- HTTP status code
- Status text description

**Example Error**:
```
Error: GET /tables/Contacts failed: 401 Unauthorized
Error: POST /tables/Contacts failed: 400 Bad Request
```

## Usage Patterns

### Basic GET Request

```typescript
const httpClient = new HttpClient(baseUrl, () => token);

try {
  const data = await httpClient.get<Contact[]>('/tables/Contacts', {
    $filter: 'Contact_Status_ID=1',
    $orderby: 'Last_Name,First_Name'
  });
  console.log('Contacts:', data);
} catch (error) {
  console.error('Failed to fetch contacts:', error);
}
```

### File Upload

```typescript
const formData = new FormData();
formData.append('file-0', file, file.name);
formData.append('description', 'Document upload');

try {
  const result = await httpClient.postFormData<FileDescription[]>(
    `/files/Contacts/${contactId}`,
    formData,
    { $userId: userId }
  );
  console.log('Upload successful:', result);
} catch (error) {
  console.error('Upload failed:', error);
}
```

### Batch Operations

```typescript
// Create multiple records
const records = [
  { First_Name: 'John', Last_Name: 'Doe' },
  { First_Name: 'Jane', Last_Name: 'Smith' }
];

try {
  const created = await httpClient.post<Contact[]>('/tables/Contacts', records);
  console.log('Created contacts:', created);
} catch (error) {
  console.error('Batch creation failed:', error);
}
```

## Best Practices

1. **Always Use Generic Types**: Specify return types for better TypeScript support
2. **Handle Errors**: Wrap all HTTP calls in try-catch blocks
3. **URL Encoding**: Let the class handle URL encoding automatically
4. **Query Parameters**: Use the queryParams parameter instead of manual URL construction
5. **Form Data**: Use postFormData/putFormData for file uploads, not regular post/put

## Common Pitfalls

1. **Manual URL Construction**: Don't concatenate URLs manually - use the queryParams parameter
2. **Content-Type Headers**: Don't set Content-Type for FormData - let the browser handle it
3. **Token Management**: Don't pass tokens directly - use the getToken function
4. **Error Handling**: Always check response.ok before processing response data

## Integration with Higher-Level Services

The HttpClient is used by the MinistryPlatformClient, which in turn is used by all service classes:

```typescript
// In MinistryPlatformClient
constructor() {
    this.httpClient = new HttpClient(this.baseUrl, () => this.token);
}

// In Services
public async getTableRecords<T>(table: string, params?: TableQueryParams): Promise<T[]> {
    await this.client.ensureValidToken();
    const endpoint = `/tables/${encodeURIComponent(table)}`;
    return await this.client.getHttpClient().get<T[]>(endpoint, params);
}
```

This layered approach ensures consistent authentication, error handling, and request formatting across all Ministry Platform operations.
