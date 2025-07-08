# ministryPlatformProvider - Core Provider Singleton

## Overview

The `ministryPlatformProvider` class serves as the central orchestrator for all Ministry Platform operations. It implements the Singleton pattern to ensure a single, shared instance across the application and coordinates between the core client and specialized service classes.

## Class Structure

```typescript
export class ministryPlatformProvider {
    private static instance: ministryPlatformProvider;
    
    private client: MinistryPlatformClient;
    private tableService: TableService;
    private procedureService: ProcedureService;
    private communicationService: CommunicationService;
    private metadataService: MetadataService;
    private domainService: DomainService;
    private fileService: FileService;
    
    private constructor()
    public static getInstance(): ministryPlatformProvider
}
```

## Singleton Pattern Implementation

### Private Constructor

```typescript
private constructor() {
    this.client = new MinistryPlatformClient();
    this.tableService = new TableService(this.client);
    this.procedureService = new ProcedureService(this.client);
    this.communicationService = new CommunicationService(this.client);
    this.metadataService = new MetadataService(this.client);
    this.domainService = new DomainService(this.client);
    this.fileService = new FileService(this.client);
}
```

**Initialization Process**:
1. Creates the core `MinistryPlatformClient` instance
2. Instantiates all service classes with the shared client
3. Ensures single point of authentication and configuration

### Static getInstance Method

```typescript
public static getInstance(): ministryPlatformProvider {
    if (!this.instance) {
        this.instance = new ministryPlatformProvider();
    }
    return this.instance;
}
```

**Benefits of Singleton Pattern**:
- **Single Authentication Context**: All services share the same token
- **Resource Efficiency**: One client instance serves all operations
- **Consistent Configuration**: Shared environment settings across services
- **State Management**: Centralized state for connections and cache

## Service Delegation Architecture

The provider acts as a facade, delegating operations to specialized service classes:

```
MPHelper
    ↓
ministryPlatformProvider (Singleton)
    ↓
┌─────────────────┬─────────────────┬─────────────────┐
│   TableService  │ ProcedureService│CommunicationSvc │
│   DomainService │ MetadataService │   FileService   │
└─────────────────┴─────────────────┴─────────────────┘
    ↓
MinistryPlatformClient
    ↓
HttpClient
```

## Domain Service Methods

### getDomainInfo

```typescript
public async getDomainInfo(): Promise<DomainInfo>
```

**Purpose**: Retrieves basic domain configuration information

**Delegation**: Calls `this.domainService.getDomainInfo()`

**Returns**: Domain configuration object with settings like time zone, culture, and security options

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();
const domainInfo = await provider.getDomainInfo();

console.log('Domain Name:', domainInfo.DisplayName);
console.log('Time Zone:', domainInfo.TimeZoneName);
console.log('MFA Enabled:', domainInfo.IsSmsMfaEnabled);
```

### getGlobalFilters

```typescript
public async getGlobalFilters(params?: GlobalFilterParams): Promise<GlobalFilterItem[]>
```

**Purpose**: Retrieves available global filters for data filtering

**Parameters**:
- `params`: Optional parameters for filter configuration

**Delegation**: Calls `this.domainService.getGlobalFilters(params)`

**Returns**: Array of global filter items with keys and display values

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();
const filters = await provider.getGlobalFilters();

filters.forEach(filter => {
    console.log(`Filter ${filter.Key}: ${filter.Value}`);
});
```

## Metadata Service Methods

### refreshMetadata

```typescript
public async refreshMetadata(): Promise<void>
```

**Purpose**: Triggers metadata cache refresh across all servers

**Delegation**: Calls `this.metadataService.refreshMetadata()`

**Use Cases**:
- After schema changes
- When table definitions are updated
- For troubleshooting metadata issues

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();
await provider.refreshMetadata();
console.log('Metadata cache refreshed successfully');
```

### getTables

```typescript
public async getTables(search?: string): Promise<TableMetadata[]>
```

**Purpose**: Retrieves list of available tables with metadata

**Parameters**:
- `search`: Optional search term to filter table names

**Delegation**: Calls `this.metadataService.getTables(search)`

**Returns**: Array of table metadata objects including access levels and permissions

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();

// Get all tables
const allTables = await provider.getTables();

// Search for contact-related tables
const contactTables = await provider.getTables('contact');
contactTables.forEach(table => {
    console.log(`${table.Name}: ${table.AccessLevel}`);
});
```

## Table Service Methods

### getTableRecords

```typescript
public async getTableRecords<T>(table: string, params?: TableQueryParams): Promise<T[]>
```

**Purpose**: Retrieves records from any Ministry Platform table

**Parameters**:
- `table`: Table name
- `params`: Query parameters for filtering, sorting, pagination

**Delegation**: Calls `this.tableService.getTableRecords<T>(table, params)`

**Returns**: Array of typed records

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();

const contacts = await provider.getTableRecords<Contact>('Contacts', {
    $filter: 'Contact_Status_ID=1',
    $select: 'Contact_ID,Display_Name,Email_Address',
    $orderby: 'Last_Name,First_Name',
    $top: 100
});
```

### createTableRecords

```typescript
public async createTableRecords<T extends TableRecord = TableRecord>(
    table: string, 
    records: T[], 
    params?: Pick<TableQueryParams, '$select' | '$userId'>
): Promise<T[]>
```

**Purpose**: Creates new records in the specified table

**Parameters**:
- `table`: Target table name
- `records`: Array of records to create
- `params`: Optional selection and user context parameters

**Delegation**: Calls `this.tableService.createTableRecords<T>(table, records, params)`

**Returns**: Array of created records with generated IDs

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();

const newContacts = await provider.createTableRecords('Contacts', [
    {
        First_Name: 'John',
        Last_Name: 'Doe',
        Email_Address: 'john@example.com',
        Contact_Status_ID: 1
    }
], {
    $select: 'Contact_ID,Display_Name',
    $userId: 1
});
```

### updateTableRecords

```typescript
public async updateTableRecords<T extends TableRecord = TableRecord>(
    table: string, 
    records: T[], 
    params?: Pick<TableQueryParams, '$select' | '$userId' | '$allowCreate'>
): Promise<T[]>
```

**Purpose**: Updates existing records in the specified table

**Parameters**:
- `table`: Target table name
- `records`: Array of records to update (must include IDs)
- `params`: Optional parameters including upsert capability

**Delegation**: Calls `this.tableService.updateTableRecords<T>(table, records, params)`

**Returns**: Array of updated records

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();

const updatedContacts = await provider.updateTableRecords('Contacts', [
    {
        Contact_ID: 12345,
        Mobile_Phone: '555-0123',
        Email_Address: 'newemail@example.com'
    }
], {
    $allowCreate: false,
    $userId: 1
});
```

### deleteTableRecords

```typescript
public async deleteTableRecords<T extends TableRecord = TableRecord>(
    table: string, 
    ids: number[], 
    params?: Pick<TableQueryParams, '$select' | '$userId'>
): Promise<T[]>
```

**Purpose**: Deletes multiple records from the specified table

**Parameters**:
- `table`: Target table name
- `ids`: Array of record IDs to delete
- `params`: Optional selection and user context parameters

**Delegation**: Calls `this.tableService.deleteTableRecords<T>(table, ids, params)`

**Returns**: Array of deleted records

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();

const deletedLogs = await provider.deleteTableRecords('Contact_Log', 
    [67890, 67891, 67892], 
    {
        $userId: 1
    }
);
```

## Procedure Service Methods

### getProcedures

```typescript
public async getProcedures(search?: string): Promise<ProcedureInfo[]>
```

**Purpose**: Retrieves list of available stored procedures

**Parameters**:
- `search`: Optional search term to filter procedure names

**Delegation**: Calls `this.procedureService.getProcedures(search)`

**Returns**: Array of procedure metadata with parameter information

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();

const apiProcedures = await provider.getProcedures('api_');
apiProcedures.forEach(proc => {
    console.log(`Procedure: ${proc.Name}`);
    proc.Parameters.forEach(param => {
        console.log(`  ${param.Name}: ${param.DataType} (${param.Direction})`);
    });
});
```

### executeProcedure

```typescript
public async executeProcedure(
    procedure: string, 
    params?: QueryParams
): Promise<unknown[][]>
```

**Purpose**: Executes stored procedure with query string parameters

**Parameters**:
- `procedure`: Stored procedure name
- `params`: Query string parameters

**Delegation**: Calls `this.procedureService.executeProcedure(procedure, params)`

**Returns**: Array of result sets

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();

const results = await provider.executeProcedure('api_GetContactsByHousehold', {
    HouseholdId: 123,
    IncludeInactive: 'false'
});

const householdMembers = results[0] as Contact[];
```

### executeProcedureWithBody

```typescript
public async executeProcedureWithBody(
    procedure: string, 
    parameters: Record<string, unknown>
): Promise<unknown[][]>
```

**Purpose**: Executes stored procedure with request body parameters

**Parameters**:
- `procedure`: Stored procedure name
- `parameters`: Request body parameters object

**Delegation**: Calls `this.procedureService.executeProcedureWithBody(procedure, parameters)`

**Returns**: Array of result sets

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();

const results = await provider.executeProcedureWithBody('api_ComplexSearch', {
    SearchCriteria: {
        FirstName: 'John',
        LastName: 'Doe',
        MinAge: 18,
        MaxAge: 65
    },
    Options: {
        IncludeInactive: false,
        SortBy: 'LastName'
    }
});
```

## Communication Service Methods

### createCommunication

```typescript
public async createCommunication(
    communication: CommunicationInfo,
    attachments?: File[]
): Promise<Communication>
```

**Purpose**: Creates and schedules a new communication

**Parameters**:
- `communication`: Communication configuration object
- `attachments`: Optional file attachments

**Delegation**: Calls `this.communicationService.createCommunication(communication, attachments)`

**Returns**: Created communication object

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();

const communication = await provider.createCommunication({
    AuthorUserId: 1,
    FromContactId: 1,
    ReplyToContactId: 1,
    Subject: 'Weekly Newsletter',
    Body: '<h1>This Week at Church</h1>',
    CommunicationType: 'Email',
    Contacts: [12345, 67890],
    IsBulkEmail: true,
    SendToContactParents: false,
    StartDate: new Date().toISOString()
}, [attachmentFile]);
```

### sendMessage

```typescript
public async sendMessage(
    message: MessageInfo,
    attachments?: File[]
): Promise<Communication>
```

**Purpose**: Sends a direct message immediately

**Parameters**:
- `message`: Message configuration object
- `attachments`: Optional file attachments

**Delegation**: Calls `this.communicationService.sendMessage(message, attachments)`

**Returns**: Created communication object

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();

const message = await provider.sendMessage({
    FromAddress: { DisplayName: 'Pastor', Address: 'pastor@church.com' },
    ToAddresses: [{ DisplayName: 'Member', Address: 'member@example.com' }],
    Subject: 'Personal Follow-up',
    Body: 'Thank you for visiting our church!'
});
```

## File Service Methods

### getFilesByRecord

```typescript
public async getFilesByRecord(
    table: string,
    recordId: number,
    defaultOnly?: boolean
): Promise<FileDescription[]>
```

**Purpose**: Retrieves files attached to a specific record

**Parameters**:
- `table`: Table name containing the record
- `recordId`: Record ID to get files for
- `defaultOnly`: Return only default files

**Delegation**: Calls `this.fileService.getFilesByRecord(table, recordId, defaultOnly)`

**Returns**: Array of file descriptions

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();

const contactFiles = await provider.getFilesByRecord('Contacts', 12345);
const defaultImage = await provider.getFilesByRecord('Contacts', 12345, true);
```

### uploadFiles

```typescript
public async uploadFiles(
    table: string,
    recordId: number,
    files: File[],
    params?: FileUploadParams
): Promise<FileDescription[]>
```

**Purpose**: Uploads multiple files to a record

**Parameters**:
- `table`: Target table name
- `recordId`: Record ID to attach files to
- `files`: Array of File objects
- `params`: Optional upload parameters

**Delegation**: Calls `this.fileService.uploadFiles(table, recordId, files, params)`

**Returns**: Array of uploaded file descriptions

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();

const uploadedFiles = await provider.uploadFiles('Contacts', 12345, [file1, file2], {
    description: 'Profile documents',
    isDefaultImage: true,
    userId: 1
});
```

### updateFile

```typescript
public async updateFile(
    fileId: number,
    file?: File,
    params?: FileUpdateParams
): Promise<FileDescription>
```

**Purpose**: Updates file content and/or metadata

**Parameters**:
- `fileId`: File ID to update
- `file`: Optional new file content
- `params`: Optional update parameters

**Delegation**: Calls `this.fileService.updateFile(fileId, file, params)`

**Returns**: Updated file description

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();

const updatedFile = await provider.updateFile(67890, newFile, {
    description: 'Updated document',
    isDefaultImage: false
});
```

### deleteFile

```typescript
public async deleteFile(
    fileId: number,
    userId?: number
): Promise<void>
```

**Purpose**: Deletes a file

**Parameters**:
- `fileId`: File ID to delete
- `userId`: Optional user ID for auditing

**Delegation**: Calls `this.fileService.deleteFile(fileId, userId)`

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();

await provider.deleteFile(67890, 1);
```

### getFileContentByUniqueId

```typescript
public async getFileContentByUniqueId(
    uniqueFileId: string,
    thumbnail?: boolean
): Promise<Blob>
```

**Purpose**: Downloads file content by unique ID (public access)

**Parameters**:
- `uniqueFileId`: Globally unique file identifier
- `thumbnail`: Return thumbnail version

**Delegation**: Calls `this.fileService.getFileContentByUniqueId(uniqueFileId, thumbnail)`

**Returns**: File content as Blob

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();

const fileContent = await provider.getFileContentByUniqueId('abc123-def456');
const thumbnailContent = await provider.getFileContentByUniqueId('abc123-def456', true);
```

### getFileMetadata

```typescript
public async getFileMetadata(fileId: number): Promise<FileDescription>
```

**Purpose**: Retrieves file metadata by database ID

**Parameters**:
- `fileId`: Database file ID

**Delegation**: Calls `this.fileService.getFileMetadata(fileId)`

**Returns**: File description object

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();

const metadata = await provider.getFileMetadata(67890);
console.log(`File: ${metadata.FileName} (${metadata.FileSize} bytes)`);
```

### getFileMetadataByUniqueId

```typescript
public async getFileMetadataByUniqueId(uniqueFileId: string): Promise<FileDescription>
```

**Purpose**: Retrieves file metadata by unique ID

**Parameters**:
- `uniqueFileId`: Globally unique file identifier

**Delegation**: Calls `this.fileService.getFileMetadataByUniqueId(uniqueFileId)`

**Returns**: File description object

**Example Usage**:
```typescript
const provider = ministryPlatformProvider.getInstance();

const metadata = await provider.getFileMetadataByUniqueId('abc123-def456');
```

## Usage Patterns

### Service Coordination

```typescript
const provider = ministryPlatformProvider.getInstance();

// Get domain configuration
const domainInfo = await provider.getDomainInfo();

// Get available tables based on permissions
const tables = await provider.getTables();

// Create records in multiple tables with shared authentication
const contacts = await provider.createTableRecords('Contacts', contactData);
const logs = await provider.createTableRecords('Contact_Log', logData);

// Send communication to new contacts
await provider.createCommunication({
    // ... communication config
    Contacts: contacts.map(c => c.Contact_ID)
});
```

### Error Handling with Provider

```typescript
const provider = ministryPlatformProvider.getInstance();

try {
    // Multiple operations with shared error context
    const contacts = await provider.getTableRecords('Contacts', params);
    const procedures = await provider.getProcedures('api_');
    const files = await provider.uploadFiles('Contacts', 12345, fileList);
    
    console.log('All operations completed successfully');
} catch (error) {
    console.error('Provider operation failed:', error);
    // All operations share the same authentication and error handling
}
```

### Batch Operations Across Services

```typescript
const provider = ministryPlatformProvider.getInstance();

// Complex workflow using multiple services
async function processNewMember(memberData: any, documents: File[]) {
    // Create contact record
    const [contact] = await provider.createTableRecords('Contacts', [memberData]);
    
    // Upload documents
    await provider.uploadFiles('Contacts', contact.Contact_ID, documents);
    
    // Execute membership procedure
    await provider.executeProcedure('api_ProcessNewMember', {
        ContactId: contact.Contact_ID
    });
    
    // Send welcome communication
    await provider.sendMessage({
        FromAddress: { DisplayName: 'Church', Address: 'info@church.com' },
        ToAddresses: [{ DisplayName: contact.Display_Name, Address: contact.Email_Address }],
        Subject: 'Welcome to our church family!',
        Body: 'We are excited to have you join us!'
    });
    
    return contact;
}
```

## Singleton Benefits

1. **Shared Authentication**: Single token lifecycle across all operations
2. **Resource Efficiency**: One client instance serves all services
3. **Consistent Configuration**: Shared environment settings and base URL
4. **State Management**: Centralized connection and cache management
5. **Error Handling**: Consistent error handling patterns across services

## Best Practices

1. **Use getInstance()**: Always get the provider through the singleton method
2. **Service Delegation**: Use the provider methods rather than direct service access
3. **Error Handling**: Implement try-catch blocks around provider operations
4. **Type Safety**: Specify generic types for table operations
5. **Resource Management**: Let the provider manage service lifecycle

The `ministryPlatformProvider` serves as the central hub for all Ministry Platform operations, providing a clean, consistent interface while managing the complexity of service coordination and authentication.
