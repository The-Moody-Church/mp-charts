# MPHelper - Main Public API

## Overview

The `MPHelper` class is the primary public interface for all Ministry Platform operations. It provides a simplified, type-safe API that abstracts the complexity of the underlying provider system while maintaining full access to Ministry Platform functionality.

## Class Structure

```typescript
export class MPHelper {
    private provider: ministryPlatformProvider;
    
    constructor() {
        this.provider = ministryPlatformProvider.getInstance();
    }
}
```

## Design Philosophy

The `MPHelper` follows these principles:

1. **Simplified API**: Complex parameter objects are flattened into simple method parameters
2. **Type Safety**: All methods are generic and strongly typed
3. **Consistent Interface**: Similar operations follow the same patterns
4. **Developer Experience**: Comprehensive logging and error handling
5. **Abstraction**: Hides provider complexity while maintaining full functionality

## Table Operations

### getTableRecords

```typescript
public async getTableRecords<T>(params: {
    table: string,
    select?: string,
    filter?: string,
    orderBy?: string,
    groupBy?: string,
    having?: string,
    top?: number,
    skip?: number,
    distinct?: boolean,
    userId?: number,
    globalFilterId?: number
}): Promise<T[]>
```

**Purpose**: Retrieves records from any Ministry Platform table with comprehensive query capabilities

**Parameters**:
- `table`: Table name (e.g., 'Contacts', 'Contact_Log')
- `select`: Column list (e.g., 'Contact_ID,Display_Name,Email_Address')
- `filter`: WHERE clause (e.g., 'Contact_Status_ID=1')
- `orderBy`: ORDER BY clause (e.g., 'Last_Name,First_Name')
- `groupBy`: GROUP BY clause
- `having`: HAVING clause for grouped results
- `top`: Maximum number of records to return
- `skip`: Number of records to skip (for pagination)
- `distinct`: Remove duplicate records
- `userId`: User context for security
- `globalFilterId`: Apply global filter

**Returns**: Array of records typed as `T`

**Example Usage**:
```typescript
// Get active contacts with basic info
const contacts = await mp.getTableRecords<Contact>({
    table: 'Contacts',
    select: 'Contact_ID,Display_Name,Email_Address,Mobile_Phone',
    filter: 'Contact_Status_ID=1',
    orderBy: 'Last_Name,First_Name',
    top: 100
});

// Get contact logs for a specific person
const logs = await mp.getTableRecords<ContactLog>({
    table: 'Contact_Log',
    filter: 'Contact_ID=12345',
    orderBy: 'Contact_Date DESC',
    top: 50
});
```

**Query Parameter Mapping**:
```typescript
// Internal mapping to Ministry Platform format
const queryParams: TableQueryParams = {
    $select: params.select,
    $filter: params.filter,
    $orderby: params.orderBy,
    $groupby: params.groupBy,
    $having: params.having,
    $top: params.top,
    $skip: params.skip,
    $distinct: params.distinct,
    $userId: params.userId,
    $globalFilterId: params.globalFilterId,
};
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
- `table`: Table name where records will be created
- `records`: Array of record objects to create
- `params`: Optional parameters for selection and user context

**Returns**: Array of created records with generated IDs

**Example Usage**:
```typescript
// Create a new contact
const newContacts = await mp.createTableRecords('Contacts', [{
    First_Name: 'John',
    Last_Name: 'Doe',
    Email_Address: 'john.doe@example.com',
    Contact_Status_ID: 1
}]);

// Create multiple contact logs
const contactLogs = await mp.createTableRecords('Contact_Log', [
    {
        Contact_ID: 12345,
        Contact_Date: new Date().toISOString(),
        Made_By: 1,
        Notes: 'Initial contact made via phone',
        Contact_Log_Type_ID: 1
    },
    {
        Contact_ID: 12346,
        Contact_Date: new Date().toISOString(),
        Made_By: 1,
        Notes: 'Follow-up email sent',
        Contact_Log_Type_ID: 2
    }
]);
```

**Enhanced Logging**:
```typescript
console.log('MPHELPER: createTableRecords called');
console.log('MPHELPER: table:', table);
console.log('MPHELPER: records:', JSON.stringify(records, null, 2));
console.log('MPHELPER: params:', JSON.stringify(params, null, 2));
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
- `table`: Table name where records will be updated
- `records`: Array of record objects with IDs to update
- `params`: Optional parameters including create permission

**Returns**: Array of updated records

**Example Usage**:
```typescript
// Update contact information
const updatedContacts = await mp.updateTableRecords('Contacts', [{
    Contact_ID: 12345,
    First_Name: 'John',
    Last_Name: 'Smith', // Changed last name
    Email_Address: 'john.smith@example.com',
    Mobile_Phone: '555-0123'
}]);

// Update with create permission (upsert)
const upsertedRecords = await mp.updateTableRecords('Contact_Log', [
    {
        Contact_Log_ID: 67890,
        Notes: 'Updated notes'
    }
], {
    $allowCreate: true, // Will create if doesn't exist
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
- `table`: Table name where records will be deleted
- `ids`: Array of record IDs to delete
- `params`: Optional parameters for selection and user context

**Returns**: Array of deleted records

**Example Usage**:
```typescript
// Delete specific contact logs
const deletedLogs = await mp.deleteTableRecords('Contact_Log', [67890, 67891], {
    $userId: 1
});

// Delete inactive contacts
const inactiveContacts = await mp.getTableRecords<Contact>({
    table: 'Contacts',
    filter: 'Contact_Status_ID=3',
    select: 'Contact_ID'
});

const contactIds = inactiveContacts.map(c => c.Contact_ID);
const deletedContacts = await mp.deleteTableRecords('Contacts', contactIds);
```

## Domain Operations

### getDomainInfo

```typescript
public async getDomainInfo(): Promise<DomainInfo>
```

**Purpose**: Retrieves basic information about the current Ministry Platform domain

**Returns**: Domain configuration object

**Example Usage**:
```typescript
const domainInfo = await mp.getDomainInfo();
console.log('Domain:', domainInfo.DisplayName);
console.log('Time Zone:', domainInfo.TimeZoneName);
console.log('Culture:', domainInfo.CultureName);
```

### getGlobalFilters

```typescript
public async getGlobalFilters(params?: GlobalFilterParams): Promise<GlobalFilterItem[]>
```

**Purpose**: Retrieves available global filters for the domain

**Parameters**:
- `params`: Optional parameters for filter request

**Returns**: Array of global filter items

**Example Usage**:
```typescript
const filters = await mp.getGlobalFilters();
filters.forEach(filter => {
    console.log(`Filter ${filter.Key}: ${filter.Value}`);
});
```

## Metadata Operations

### refreshMetadata

```typescript
public async refreshMetadata(): Promise<void>
```

**Purpose**: Triggers metadata cache refresh on all servers

**Example Usage**:
```typescript
// Refresh metadata after schema changes
await mp.refreshMetadata();
console.log('Metadata cache refreshed');
```

### getTables

```typescript
public async getTables(search?: string): Promise<TableMetadata[]>
```

**Purpose**: Retrieves list of available tables with metadata

**Parameters**:
- `search`: Optional search term to filter tables

**Returns**: Array of table metadata objects

**Example Usage**:
```typescript
// Get all tables
const allTables = await mp.getTables();

// Search for contact-related tables
const contactTables = await mp.getTables('contact');
contactTables.forEach(table => {
    console.log(`Table: ${table.Name} - ${table.AccessLevel}`);
});
```

## Procedure Operations

### getProcedures

```typescript
public async getProcedures(search?: string): Promise<ProcedureInfo[]>
```

**Purpose**: Retrieves list of available stored procedures

**Parameters**:
- `search`: Optional search term to filter procedures

**Returns**: Array of procedure metadata objects

**Example Usage**:
```typescript
// Get all procedures
const procedures = await mp.getProcedures();

// Search for API procedures
const apiProcedures = await mp.getProcedures('api_');
apiProcedures.forEach(proc => {
    console.log(`Procedure: ${proc.Name}`);
    proc.Parameters.forEach(param => {
        console.log(`  - ${param.Name}: ${param.DataType}`);
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
- `params`: Query parameters object

**Returns**: Array of result sets

**Example Usage**:
```typescript
// Execute procedure with parameters
const results = await mp.executeProcedure('api_GetContactsByHousehold', {
    HouseholdId: 123,
    IncludeInactive: false
});

// Process first result set
const contacts = results[0] as Contact[];
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

**Returns**: Array of result sets

**Example Usage**:
```typescript
// Execute complex procedure with body
const results = await mp.executeProcedureWithBody('api_ComplexSearch', {
    SearchCriteria: {
        FirstName: 'John',
        LastName: 'Doe',
        Email: 'john@example.com'
    },
    Options: {
        IncludeInactive: false,
        MaxResults: 100
    }
});
```

## Communication Operations

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

**Returns**: Created communication object

**Example Usage**:
```typescript
// Create email communication
const communication = await mp.createCommunication({
    AuthorUserId: 1,
    FromContactId: 1,
    ReplyToContactId: 1,
    Subject: 'Weekly Newsletter',
    Body: '<h1>This Week at Church</h1><p>Join us for...</p>',
    CommunicationType: 'Email',
    Contacts: [12345, 67890, 13579],
    IsBulkEmail: true,
    SendToContactParents: false,
    StartDate: new Date().toISOString()
});
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

**Returns**: Created communication object

**Example Usage**:
```typescript
// Send direct email
const message = await mp.sendMessage({
    FromAddress: { DisplayName: 'Pastor John', Address: 'pastor@church.com' },
    ToAddresses: [{ DisplayName: 'John Doe', Address: 'john@example.com' }],
    Subject: 'Thank you for visiting',
    Body: 'It was great to meet you last Sunday!'
});
```

## File Operations

### getFilesByRecord

```typescript
public async getFilesByRecord(params: {
    table: string,
    recordId: number,
    defaultOnly?: boolean
}): Promise<FileDescription[]>
```

**Purpose**: Retrieves files attached to a specific record

**Parameters**:
- `table`: Table name
- `recordId`: Record ID
- `defaultOnly`: Return only default files

**Returns**: Array of file descriptions

**Example Usage**:
```typescript
// Get all files for a contact
const files = await mp.getFilesByRecord({
    table: 'Contacts',
    recordId: 12345
});

// Get only default image
const defaultImage = await mp.getFilesByRecord({
    table: 'Contacts',
    recordId: 12345,
    defaultOnly: true
});
```

### uploadFiles

```typescript
public async uploadFiles(params: {
    table: string,
    recordId: number,
    files: File[],
    uploadParams?: FileUploadParams
}): Promise<FileDescription[]>
```

**Purpose**: Uploads multiple files to a record

**Parameters**:
- `table`: Table name
- `recordId`: Record ID
- `files`: Array of File objects
- `uploadParams`: Optional upload configuration

**Returns**: Array of uploaded file descriptions

**Example Usage**:
```typescript
// Upload profile photos
const uploadedFiles = await mp.uploadFiles({
    table: 'Contacts',
    recordId: 12345,
    files: [profilePhoto, backgroundCheck],
    uploadParams: {
        description: 'Profile documentation',
        isDefaultImage: true,
        userId: 1
    }
});
```

### updateFile

```typescript
public async updateFile(params: {
    fileId: number,
    file?: File,
    updateParams?: FileUpdateParams
}): Promise<FileDescription>
```

**Purpose**: Updates file content and/or metadata

**Parameters**:
- `fileId`: File ID to update
- `file`: Optional new file content
- `updateParams`: Optional update configuration

**Returns**: Updated file description

**Example Usage**:
```typescript
// Update file metadata
const updatedFile = await mp.updateFile({
    fileId: 67890,
    updateParams: {
        description: 'Updated profile photo',
        isDefaultImage: true
    }
});

// Replace file content
const replacedFile = await mp.updateFile({
    fileId: 67890,
    file: newProfilePhoto,
    updateParams: {
        fileName: 'new-profile.jpg'
    }
});
```

### deleteFile

```typescript
public async deleteFile(params: {
    fileId: number,
    userId?: number
}): Promise<void>
```

**Purpose**: Deletes a file

**Parameters**:
- `fileId`: File ID to delete
- `userId`: Optional user ID for auditing

**Example Usage**:
```typescript
// Delete file
await mp.deleteFile({
    fileId: 67890,
    userId: 1
});
```

### getFileContentByUniqueId

```typescript
public async getFileContentByUniqueId(params: {
    uniqueFileId: string,
    thumbnail?: boolean
}): Promise<Blob>
```

**Purpose**: Downloads file content by unique ID (no authentication required)

**Parameters**:
- `uniqueFileId`: Globally unique file identifier
- `thumbnail`: Return thumbnail version

**Returns**: File content as Blob

**Example Usage**:
```typescript
// Download file content
const fileBlob = await mp.getFileContentByUniqueId({
    uniqueFileId: 'abc123-def456-ghi789'
});

// Create download link
const url = URL.createObjectURL(fileBlob);
const link = document.createElement('a');
link.href = url;
link.download = 'downloaded-file.pdf';
link.click();
```

### getFileMetadata

```typescript
public async getFileMetadata(params: {
    fileId: number
}): Promise<FileDescription>
```

**Purpose**: Retrieves file metadata by database ID

**Parameters**:
- `fileId`: Database file ID

**Returns**: File description object

**Example Usage**:
```typescript
// Get file metadata
const metadata = await mp.getFileMetadata({
    fileId: 67890
});

console.log(`File: ${metadata.FileName}`);
console.log(`Size: ${metadata.FileSize} bytes`);
console.log(`Type: ${metadata.FileExtension}`);
```

### getFileMetadataByUniqueId

```typescript
public async getFileMetadataByUniqueId(params: {
    uniqueFileId: string
}): Promise<FileDescription>
```

**Purpose**: Retrieves file metadata by unique ID

**Parameters**:
- `uniqueFileId`: Globally unique file identifier

**Returns**: File description object

**Example Usage**:
```typescript
// Get file metadata by unique ID
const metadata = await mp.getFileMetadataByUniqueId({
    uniqueFileId: 'abc123-def456-ghi789'
});
```

## Error Handling

The `MPHelper` includes comprehensive error handling with detailed logging:

```typescript
try {
    console.log('MPHELPER: createTableRecords called');
    console.log('MPHELPER: table:', table);
    console.log('MPHELPER: records:', JSON.stringify(records, null, 2));
    
    const result = await this.provider.createTableRecords<T>(table, records, params);
    console.log('MPHELPER: Operation completed successfully');
    return result;
} catch (error) {
    console.error('MPHELPER: Error in createTableRecords:');
    console.error('MPHELPER: Error type:', error?.constructor?.name);
    console.error('MPHELPER: Error message:', (error as Error)?.message);
    console.error('MPHELPER: Error stack:', (error as Error)?.stack);
    throw error; // Re-throw the original error
}
```

## Usage Patterns

### Type-Safe Operations

```typescript
// Define your types
interface MyContact {
    Contact_ID: number;
    Display_Name: string;
    Email_Address: string;
    Mobile_Phone: string;
}

// Use with type safety
const mp = new MPHelper();
const contacts = await mp.getTableRecords<MyContact>({
    table: 'Contacts',
    select: 'Contact_ID,Display_Name,Email_Address,Mobile_Phone',
    filter: 'Contact_Status_ID=1'
});

// TypeScript knows the shape of contacts
contacts.forEach(contact => {
    console.log(`${contact.Display_Name}: ${contact.Email_Address}`);
});
```

### Batch Operations

```typescript
// Create multiple records efficiently
const newContacts = await mp.createTableRecords('Contacts', [
    { First_Name: 'John', Last_Name: 'Doe', Email_Address: 'john@example.com' },
    { First_Name: 'Jane', Last_Name: 'Smith', Email_Address: 'jane@example.com' },
    { First_Name: 'Bob', Last_Name: 'Johnson', Email_Address: 'bob@example.com' }
]);

// Update multiple records
const updatedContacts = await mp.updateTableRecords('Contacts', 
    newContacts.map(contact => ({
        ...contact,
        Contact_Status_ID: 1
    }))
);
```

### Pagination

```typescript
// Implement pagination
const pageSize = 50;
let page = 0;
let allContacts: Contact[] = [];

while (true) {
    const contacts = await mp.getTableRecords<Contact>({
        table: 'Contacts',
        filter: 'Contact_Status_ID=1',
        orderBy: 'Contact_ID',
        top: pageSize,
        skip: page * pageSize
    });
    
    if (contacts.length === 0) break;
    
    allContacts = allContacts.concat(contacts);
    page++;
}
```

## Best Practices

1. **Use Type Safety**: Always specify generic types for better IDE support
2. **Handle Errors**: Wrap operations in try-catch blocks
3. **Batch Operations**: Use arrays for bulk operations when possible
4. **Logging**: Enable console logging for debugging
5. **Parameter Validation**: Validate inputs before making API calls
6. **Resource Management**: Dispose of Blob objects after use

The `MPHelper` class provides a powerful, type-safe interface for all Ministry Platform operations while maintaining simplicity and developer productivity.
