# Ministry Platform Provider Documentation

This directory contains the complete Ministry Platform API integration for the Pastor App. It provides a comprehensive abstraction layer over the Ministry Platform REST API with proper TypeScript support, authentication, and service organization.

## 🏗️ Architecture Overview

The provider follows a layered architecture pattern:

```
MPHelper (Public API)
    ↓
ministryPlatformProvider (Singleton)
    ↓
Services (Domain-specific logic)
    ↓
MinistryPlatformClient (Core HTTP client)
    ↓
HttpClient (Low-level HTTP operations)
```

## 📁 Directory Structure

```
src/providers/MinistryPlatform/
├── core/                           # Core infrastructure
│   └── ministryPlatformClient.ts   # Main HTTP client with auth
├── services/                       # Domain-specific services
│   ├── tableService.ts            # Table CRUD operations
│   ├── procedureService.ts        # Stored procedure execution
│   ├── communicationService.ts    # Email/SMS communications
│   ├── metadataService.ts         # Schema and metadata
│   ├── domainService.ts           # Domain info and filters
│   └── fileService.ts             # File upload/download
├── entities/                       # Generated entity types
│   ├── ContactLog.ts              # Contact log entity
│   ├── ContactLogSchema.ts        # Zod validation schema
│   ├── ContactLogTypes.ts         # Contact log types entity
│   └── ContactLogTypesSchema.ts   # Zod validation schema
├── Interfaces/                     # Type definitions
│   ├── mpProviderInterfaces.ts    # Main API interfaces
│   ├── contactInterfaces.ts       # Contact-specific types
│   └── mpUserProfile.ts           # User profile types
├── utils/                          # Utility classes
│   └── httpClient.ts              # HTTP client utility
├── mpHelper.ts                     # Main public API
├── ministryPlatformProvider.ts     # Core provider singleton
├── ministryPlatformAuthProvider.ts # NextAuth provider
└── clientCredentials.ts           # OAuth client credentials
```

## 🚀 Quick Start

### Basic Usage

```typescript
import { MPHelper } from '@/providers/MinistryPlatform/mpHelper';

// Initialize the helper
const mp = new MPHelper();

// Get contact records
const contacts = await mp.getTableRecords<Contact>({
  table: 'Contacts',
  filter: 'Contact_Status_ID=1',
  select: 'Contact_ID,Display_Name,Email_Address'
});

// Create a new contact log
const contactLog = await mp.createTableRecords('Contact_Log', [{
  Contact_ID: 12345,
  Contact_Date: new Date().toISOString(),
  Made_By: 1,
  Notes: 'Follow-up call completed'
}]);
```

### Authentication Setup

The provider uses OAuth2 client credentials flow for API access and NextAuth for user authentication.

#### Environment Variables

```env
MINISTRY_PLATFORM_BASE_URL=https://your-instance.ministryplatform.com
MINISTRY_PLATFORM_CLIENT_ID=your_client_id
MINISTRY_PLATFORM_CLIENT_SECRET=your_client_secret
```

#### NextAuth Configuration

```typescript
// auth.ts
import MinistryPlatform from '@/providers/MinistryPlatform/ministryPlatformAuthProvider';

export default {
  providers: [
    MinistryPlatform({
      clientId: process.env.MINISTRY_PLATFORM_CLIENT_ID,
      clientSecret: process.env.MINISTRY_PLATFORM_CLIENT_SECRET,
    }),
  ],
};
```

## 🔧 Core Components

### MPHelper - Main Public API

The `MPHelper` class is the primary interface for all Ministry Platform operations. It provides a simplified, type-safe API over the lower-level provider.

**Key Features:**
- Type-safe generic methods
- Automatic token management
- Comprehensive error handling
- Simplified parameter handling

**Example Methods:**
```typescript
// Table operations
await mp.getTableRecords<T>(params)
await mp.createTableRecords<T>(table, records, params?)
await mp.updateTableRecords<T>(table, records, params?)
await mp.deleteTableRecords<T>(table, ids, params?)

// Procedure operations
await mp.executeProcedure(procedure, params?)
await mp.executeProcedureWithBody(procedure, parameters)

// Communication operations
await mp.createCommunication(communication, attachments?)
await mp.sendMessage(message, attachments?)

// File operations
await mp.uploadFiles(params)
await mp.getFilesByRecord(params)
await mp.updateFile(params)
await mp.deleteFile(params)
```

### ministryPlatformProvider - Core Provider

A singleton class that coordinates all service operations and manages the Ministry Platform client instance.

**Responsibilities:**
- Service orchestration
- Singleton pattern implementation
- Method delegation to appropriate services

### Services Layer

Each service handles a specific domain of Ministry Platform functionality:

#### TableService
- CRUD operations for all Ministry Platform tables
- Query parameter handling
- Type-safe record operations

#### ProcedureService  
- Stored procedure execution
- Parameter handling for both GET and POST procedures
- Result set processing

#### CommunicationService
- Email and SMS message creation
- Communication template support
- File attachment handling

#### FileService
- File upload and download
- Metadata management
- Image processing and thumbnail generation

#### MetadataService
- Schema information retrieval
- Table and column metadata
- Metadata cache management

#### DomainService
- Domain configuration access
- Global filter management
- Domain-specific settings

## 🔐 Authentication & Security

### OAuth2 Client Credentials Flow

The provider uses client credentials flow for API access:

1. **Token Request**: Automatically requests access tokens using client credentials
2. **Token Caching**: Tokens are cached and automatically refreshed before expiration
3. **Token Injection**: All API requests include the Bearer token automatically

### NextAuth Integration

The `ministryPlatformAuthProvider` provides NextAuth integration for user authentication:

- **OAuth2 Authorization Code Flow**: For user authentication
- **Profile Mapping**: Maps Ministry Platform user profiles to NextAuth format
- **Token Management**: Handles both access and refresh tokens

## 🎯 Type Safety

The provider includes comprehensive TypeScript support:

### Generated Entities

Entity types are generated from Ministry Platform metadata:

```typescript
// ContactLog entity with full type safety
export interface ContactLogRecord {
  Contact_Log_ID: number;
  Contact_ID: number;
  Contact_Date: string;
  Made_By: number;
  Notes: string;
  Contact_Log_Type_ID?: number | null;
  // ... other fields
}
```

### Zod Validation Schemas

Each entity includes Zod schemas for runtime validation:

```typescript
export const ContactLogSchema = z.object({
  Contact_Log_ID: z.number().int(),
  Contact_ID: z.number().int(),
  Contact_Date: z.string().datetime(),
  Made_By: z.number().int(),
  Notes: z.string().max(2000),
  // ... other fields
});
```

### Generic Type Support

All methods support generic types for type-safe operations:

```typescript
// Type-safe contact retrieval
const contacts = await mp.getTableRecords<Contact>({
  table: 'Contacts',
  filter: 'Contact_Status_ID=1'
});

// TypeScript knows the shape of contacts
contacts.forEach(contact => {
  console.log(contact.Display_Name); // Type-safe access
});
```

## 🔄 Query Parameters

The provider supports all Ministry Platform query parameters:

```typescript
interface TableQueryParams {
  $select?: string;        // Column selection
  $filter?: string;        // WHERE clause
  $orderby?: string;       // ORDER BY clause
  $groupby?: string;       // GROUP BY clause
  $having?: string;        // HAVING clause
  $top?: number;           // LIMIT clause
  $skip?: number;          // OFFSET clause
  $distinct?: boolean;     // DISTINCT selection
  $userId?: number;        // User context
  $globalFilterId?: number; // Global filter application
  $allowCreate?: boolean;  // Allow record creation in updates
}
```

## 🎨 Usage Examples

### Contact Management

```typescript
// Search for contacts
const contacts = await mp.getTableRecords<Contact>({
  table: 'Contacts',
  filter: 'Display_Name LIKE "%John%"',
  select: 'Contact_ID,Display_Name,Email_Address,Mobile_Phone',
  orderBy: 'Last_Name,First_Name',
  top: 50
});

// Create contact log entry
const contactLog = await mp.createTableRecords('Contact_Log', [{
  Contact_ID: contacts[0].Contact_ID,
  Contact_Date: new Date().toISOString(),
  Made_By: 1,
  Notes: 'Initial contact made via phone',
  Contact_Log_Type_ID: 1
}]);
```

### Communication

```typescript
// Send email communication
const communication = await mp.createCommunication({
  AuthorUserId: 1,
  FromContactId: 1,
  ReplyToContactId: 1,
  Subject: 'Welcome to our church!',
  Body: '<p>Welcome! We are excited to have you join our community.</p>',
  CommunicationType: 'Email',
  Contacts: [12345, 67890],
  IsBulkEmail: true,
  SendToContactParents: false,
  StartDate: new Date().toISOString()
});

// Send direct message
const message = await mp.sendMessage({
  FromAddress: { DisplayName: 'Pastor John', Address: 'pastor@church.com' },
  ToAddresses: [{ DisplayName: 'Member', Address: 'member@example.com' }],
  Subject: 'Personal follow-up',
  Body: 'Thank you for visiting our church last Sunday!'
});
```

### File Management

```typescript
// Upload files to a contact record
const files = await mp.uploadFiles({
  table: 'Contacts',
  recordId: 12345,
  files: [file1, file2],
  uploadParams: {
    description: 'Profile photos',
    isDefaultImage: true
  }
});

// Get files attached to a record
const attachedFiles = await mp.getFilesByRecord({
  table: 'Contacts',
  recordId: 12345,
  defaultOnly: false
});
```

### Stored Procedures

```typescript
// Execute procedure with query parameters
const results = await mp.executeProcedure('api_GetContactsByHousehold', {
  HouseholdId: 123,
  IncludeInactive: false
});

// Execute procedure with body parameters
const results = await mp.executeProcedureWithBody('api_ComplexContactSearch', {
  SearchCriteria: {
    FirstName: 'John',
    LastName: 'Doe',
    Email: 'john@example.com'
  },
  IncludeRelated: true
});
```

## 🚨 Error Handling

The provider includes comprehensive error handling:

```typescript
try {
  const contacts = await mp.getTableRecords<Contact>({
    table: 'Contacts',
    filter: 'invalid_filter'
  });
} catch (error) {
  if (error instanceof Error) {
    console.error('API Error:', error.message);
    // Handle specific error types
  }
}
```

## 🔍 Debugging

Enable detailed logging by checking the console output. The provider includes extensive logging for:

- Token refresh operations
- API request/response cycles
- Error details with stack traces
- Parameter validation

## 📝 Best Practices

1. **Use Type Safety**: Always specify generic types for table operations
2. **Handle Errors**: Wrap API calls in try-catch blocks
3. **Batch Operations**: Use bulk operations when possible for better performance
4. **Cache Results**: Cache frequently accessed data to reduce API calls
5. **Validate Input**: Use Zod schemas for input validation before API calls

## 🔄 Future Enhancements

- [ ] Real-time subscription support via WebSockets
- [ ] Enhanced caching with Redis integration
- [ ] Batch operation optimization
- [ ] GraphQL-style field selection
- [ ] Rate limiting and retry logic
- [ ] Offline synchronization capabilities

## 📚 Additional Resources

- [Ministry Platform API Documentation](https://docs.ministryplatform.com/)
- [NextAuth Documentation](https://next-auth.js.org/)
- [Zod Schema Validation](https://zod.dev/)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/)
