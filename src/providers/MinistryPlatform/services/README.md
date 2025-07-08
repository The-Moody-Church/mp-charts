# Ministry Platform Services Documentation

## Overview

The services directory contains specialized service classes that handle specific domains of Ministry Platform functionality. Each service focuses on a particular aspect of the API while sharing common patterns for authentication, error handling, and HTTP communication.

## Service Architecture

```
ministryPlatformProvider
    ↓
┌─────────────────┬─────────────────┬─────────────────┐
│   TableService  │ ProcedureService│CommunicationSvc │
│   DomainService │ MetadataService │   FileService   │
└─────────────────┴─────────────────┴─────────────────┘
    ↓
MinistryPlatformClient
```

## Common Service Patterns

All services follow these consistent patterns:

### Constructor Pattern
```typescript
export class ServiceName {
    private client: MinistryPlatformClient;

    constructor(client: MinistryPlatformClient) {
        this.client = client;
    }
}
```

### Method Pattern
```typescript
public async methodName(params): Promise<ReturnType> {
    try {
        await this.client.ensureValidToken();
        const endpoint = '/api/endpoint';
        return await this.client.getHttpClient().method<ReturnType>(endpoint, params);
    } catch (error) {
        console.error('Error message:', error);
        throw error;
    }
}
```

## Service Classes

### 1. TableService

**Purpose**: Handles all CRUD operations for Ministry Platform tables

**Key Methods**:
- `getTableRecords<T>()` - Query records from any table
- `createTableRecords<T>()` - Create new records
- `updateTableRecords<T>()` - Update existing records
- `deleteTableRecords<T>()` - Delete records by ID

**Usage Examples**:
```typescript
// Get contacts
const contacts = await tableService.getTableRecords<Contact>('Contacts', {
    $filter: 'Contact_Status_ID=1',
    $select: 'Contact_ID,Display_Name,Email_Address'
});

// Create new contact
const newContacts = await tableService.createTableRecords('Contacts', [{
    First_Name: 'John',
    Last_Name: 'Doe',
    Email_Address: 'john@example.com'
}]);
```

### 2. ProcedureService

**Purpose**: Executes stored procedures with parameter handling

**Key Methods**:
- `getProcedures()` - List available stored procedures
- `executeProcedure()` - Execute with query parameters
- `executeProcedureWithBody()` - Execute with request body parameters

**Usage Examples**:
```typescript
// Get available procedures
const procedures = await procedureService.getProcedures('api_');

// Execute procedure with query params
const results = await procedureService.executeProcedure('api_GetContacts', {
    HouseholdId: 123
});

// Execute procedure with body params
const results = await procedureService.executeProcedureWithBody('api_Search', {
    SearchCriteria: { FirstName: 'John' }
});
```

### 3. CommunicationService

**Purpose**: Handles email and SMS communications with attachment support

**Key Methods**:
- `createCommunication()` - Create bulk communications
- `sendMessage()` - Send direct messages
- `createCommunicationWithAttachments()` - Handle file attachments (private)
- `sendMessageWithAttachments()` - Handle message attachments (private)

**Usage Examples**:
```typescript
// Create bulk email
const communication = await communicationService.createCommunication({
    AuthorUserId: 1,
    Subject: 'Newsletter',
    Body: '<h1>Weekly Update</h1>',
    CommunicationType: 'Email',
    Contacts: [12345, 67890]
});

// Send direct message
const message = await communicationService.sendMessage({
    FromAddress: { DisplayName: 'Pastor', Address: 'pastor@church.com' },
    ToAddresses: [{ DisplayName: 'Member', Address: 'member@example.com' }],
    Subject: 'Personal note',
    Body: 'Thank you for visiting!'
});
```

### 4. FileService

**Purpose**: Manages file uploads, downloads, and metadata

**Key Methods**:
- `getFilesByRecord()` - Get files attached to records
- `uploadFiles()` - Upload multiple files to records
- `updateFile()` - Update file content/metadata
- `deleteFile()` - Delete files
- `getFileContentByUniqueId()` - Public file download
- `getFileMetadata()` - Get file information

**Usage Examples**:
```typescript
// Upload files to contact
const uploadedFiles = await fileService.uploadFiles('Contacts', 12345, [file1, file2], {
    description: 'Profile documents',
    isDefaultImage: true
});

// Get files for record
const contactFiles = await fileService.getFilesByRecord('Contacts', 12345);

// Download file content
const fileBlob = await fileService.getFileContentByUniqueId('unique-file-id');
```

### 5. MetadataService

**Purpose**: Handles schema information and metadata operations

**Key Methods**:
- `refreshMetadata()` - Refresh metadata cache
- `getTables()` - Get available tables with metadata

**Usage Examples**:
```typescript
// Refresh metadata cache
await metadataService.refreshMetadata();

// Get table information
const tables = await metadataService.getTables('contact');
tables.forEach(table => {
    console.log(`${table.Name}: ${table.AccessLevel}`);
});
```

### 6. DomainService

**Purpose**: Provides domain configuration and global filter information

**Key Methods**:
- `getDomainInfo()` - Get domain configuration
- `getGlobalFilters()` - Get available global filters

**Usage Examples**:
```typescript
// Get domain information
const domainInfo = await domainService.getDomainInfo();
console.log('Domain:', domainInfo.DisplayName);
console.log('Time Zone:', domainInfo.TimeZoneName);

// Get global filters
const filters = await domainService.getGlobalFilters();
filters.forEach(filter => {
    console.log(`Filter ${filter.Key}: ${filter.Value}`);
});
```

## Error Handling Patterns

### Standard Error Handling
```typescript
try {
    await this.client.ensureValidToken();
    return await this.client.getHttpClient().get<T>(endpoint, params);
} catch (error) {
    console.error(`Error in ${serviceName}.${methodName}:`, error);
    throw error;
}
```

### Enhanced Logging (TableService Example)
```typescript
console.log('TABLESERVICE: createTableRecords called');
console.log('TABLESERVICE: table:', table);
console.log('TABLESERVICE: records:', JSON.stringify(records, null, 2));

try {
    console.log('TABLESERVICE: About to call ensureValidToken');
    await this.client.ensureValidToken();
    
    const result = await this.client.getHttpClient().post<T[]>(endpoint, records);
    console.log('TABLESERVICE: Operation completed successfully');
    return result;
} catch (error) {
    console.error('TABLESERVICE: Error type:', error?.constructor?.name);
    console.error('TABLESERVICE: Error message:', (error as Error)?.message);
    throw error;
}
```

## Authentication Flow

Each service method follows this authentication pattern:

1. **Token Validation**: `await this.client.ensureValidToken()`
2. **HTTP Request**: Use the authenticated HTTP client
3. **Error Handling**: Catch and re-throw with context

```typescript
public async serviceMethod(): Promise<ResultType> {
    try {
        // Step 1: Ensure valid authentication
        await this.client.ensureValidToken();
        
        // Step 2: Make authenticated request
        const endpoint = '/api/endpoint';
        const result = await this.client.getHttpClient().get<ResultType>(endpoint);
        
        // Step 3: Return result
        return result;
    } catch (error) {
        // Step 4: Handle errors with context
        console.error(`Error in ${this.constructor.name}.serviceMethod:`, error);
        throw error;
    }
}
```

## HTTP Method Usage

### GET Requests
- Used for: Reading data, executing procedures with query params
- Methods: `tableService.getTableRecords()`, `procedureService.executeProcedure()`

### POST Requests  
- Used for: Creating records, sending communications, executing procedures with body
- Methods: `tableService.createTableRecords()`, `communicationService.createCommunication()`

### PUT Requests
- Used for: Updating records, updating files
- Methods: `tableService.updateTableRecords()`, `fileService.updateFile()`

### DELETE Requests
- Used for: Deleting records and files
- Methods: `tableService.deleteTableRecords()`, `fileService.deleteFile()`

### Form Data Requests
- Used for: File uploads with metadata
- Methods: `fileService.uploadFiles()`, `communicationService` with attachments

## Type Safety Features

### Generic Type Support
```typescript
// Service methods are generic
public async getTableRecords<T>(table: string, params?: TableQueryParams): Promise<T[]>

// Usage with type safety
const contacts = await service.getTableRecords<Contact>('Contacts', params);
// TypeScript knows contacts is Contact[]
```

### Interface Constraints
```typescript
// Records must extend TableRecord interface
public async createTableRecords<T extends TableRecord = TableRecord>(
    table: string, 
    records: T[]
): Promise<T[]>
```

### Parameter Type Safety
```typescript
// Parameters use well-defined interfaces
export interface TableQueryParams {
    $select?: string;
    $filter?: string;
    $orderby?: string;
    // ... other parameters
}
```

## Performance Considerations

### Batch Operations
```typescript
// Services support batch operations for efficiency
const multipleRecords = await tableService.createTableRecords('Contacts', [
    { First_Name: 'John', Last_Name: 'Doe' },
    { First_Name: 'Jane', Last_Name: 'Smith' },
    { First_Name: 'Bob', Last_Name: 'Johnson' }
]);
```

### Query Optimization
```typescript
// Use $select to limit returned columns
const contacts = await tableService.getTableRecords('Contacts', {
    $select: 'Contact_ID,Display_Name', // Only fetch needed columns
    $filter: 'Contact_Status_ID=1',     // Filter server-side
    $top: 100                           // Limit results
});
```

### File Handling
```typescript
// Upload multiple files in single request
const files = await fileService.uploadFiles('Contacts', recordId, [file1, file2, file3]);

// Use unique ID for public file access (no auth required)
const fileContent = await fileService.getFileContentByUniqueId(uniqueId);
```

## Best Practices

1. **Always Check Authentication**: Call `ensureValidToken()` before requests
2. **Use Type Safety**: Specify generic types for better IDE support
3. **Handle Errors Gracefully**: Wrap service calls in try-catch blocks
4. **Log Operations**: Use consistent logging patterns for debugging
5. **Batch When Possible**: Use array parameters for bulk operations
6. **Optimize Queries**: Use `$select` and `$filter` to reduce data transfer
7. **Resource Management**: Properly dispose of file Blobs after use

## Integration Examples

### Multi-Service Workflow
```typescript
class MembershipService {
    constructor(private provider: ministryPlatformProvider) {}
    
    async processNewMember(memberData: any, documents: File[]) {
        // Create contact record
        const [contact] = await this.provider.createTableRecords('Contacts', [memberData]);
        
        // Upload membership documents
        await this.provider.uploadFiles('Contacts', contact.Contact_ID, documents);
        
        // Execute membership procedure
        await this.provider.executeProcedure('api_ProcessMembership', {
            ContactId: contact.Contact_ID
        });
        
        // Send welcome email
        await this.provider.sendMessage({
            FromAddress: { DisplayName: 'Church', Address: 'info@church.com' },
            ToAddresses: [{ DisplayName: contact.Display_Name, Address: contact.Email_Address }],
            Subject: 'Welcome!',
            Body: 'Welcome to our church family!'
        });
        
        return contact;
    }
}
```

This service architecture provides a clean separation of concerns while maintaining consistency and type safety across all Ministry Platform operations.
