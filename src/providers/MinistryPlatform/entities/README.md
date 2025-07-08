# Ministry Platform Entities Documentation

## Overview

The entities directory contains TypeScript interfaces and Zod validation schemas for Ministry Platform database tables. These entities provide type safety, runtime validation, and serve as the foundation for all table operations within the application.

## Entity Structure

Each entity follows a consistent pattern:

1. **TypeScript Interface** (`TableName.ts`) - Type definitions for the table structure
2. **Zod Schema** (`TableNameSchema.ts`) - Runtime validation and parsing

## Entity Generation

Entities are generated from Ministry Platform table metadata with the following information:

```typescript
/**
 * Interface for Table_Name
 * Table: Table_Name
 * Access Level: ReadWriteAssignDelete
 * Special Permissions: FileAttach, DataExport, SecureRecord
 * Generated from column metadata
 */
```

## Contact Log Entity

### ContactLog Interface (`ContactLog.ts`)

```typescript
export interface ContactLogRecord {
  Contact_Log_ID: number; // Primary Key
  Contact_ID: number; // Foreign Key -> Contacts.Contact_ID
  Contact_Date: string; // ISO datetime
  Made_By: number; // Foreign Key -> dp_Users.User_ID
  Notes: string; // max 2000 chars
  Contact_Log_Type_ID?: number | null; // Foreign Key -> Contact_Log_Types.Contact_Log_Type_ID
  Planned_Contact_ID?: number | null; // Foreign Key -> Planned_Contacts.Planned_Contact_ID
  Contact_Successful?: boolean | null;
  Original_Contact_Log_Entry?: number | null; // Foreign Key -> Contact_Log.Contact_Log_ID
  Feedback_Entry_ID?: number | null; // Foreign Key -> Feedback_Entries.Feedback_Entry_ID
}

export type ContactLog = ContactLogRecord;
```

**Key Features**:
- **Primary Key**: `Contact_Log_ID` (auto-generated)
- **Required Fields**: `Contact_ID`, `Contact_Date`, `Made_By`, `Notes`
- **Foreign Keys**: Links to Contacts, Users, Contact Log Types, etc.
- **Optional Fields**: Marked with `?` and `| null` for nullable columns
- **Field Constraints**: Comments indicate max lengths and data types

**Usage Examples**:
```typescript
// Create new contact log entry
const newLog: Partial<ContactLogRecord> = {
    Contact_ID: 12345,
    Contact_Date: new Date().toISOString(),
    Made_By: 1,
    Notes: 'Initial follow-up call completed. Person expressed interest in joining small group.',
    Contact_Log_Type_ID: 1,
    Contact_Successful: true
};

// Type-safe table operations
const createdLog = await mp.createTableRecords<ContactLogRecord>('Contact_Log', [newLog]);

// Update existing log
const updatedLog: Partial<ContactLogRecord> = {
    Contact_Log_ID: createdLog[0].Contact_Log_ID,
    Notes: 'Updated: Person confirmed interest and provided preferred meeting times.',
    Contact_Successful: true
};

const updated = await mp.updateTableRecords<ContactLogRecord>('Contact_Log', [updatedLog]);
```

### ContactLogSchema (`ContactLogSchema.ts`)

```typescript
import { z } from 'zod';

export const ContactLogSchema = z.object({
  Contact_Log_ID: z.number().int(),
  Contact_ID: z.number().int(),
  Contact_Date: z.string().datetime(),
  Made_By: z.number().int(),
  Notes: z.string().max(2000),
  Contact_Log_Type_ID: z.number().int().nullable(),
  Planned_Contact_ID: z.number().int().nullable(),
  Contact_Successful: z.boolean().nullable(),
  Original_Contact_Log_Entry: z.number().int().nullable(),
  Feedback_Entry_ID: z.number().int().nullable(),
});

export type ContactLogInput = z.infer<typeof ContactLogSchema>;
```

**Validation Features**:
- **Type Coercion**: Converts strings to appropriate types
- **Format Validation**: Ensures datetime strings are valid ISO format
- **Length Constraints**: Enforces maximum string lengths
- **Null Handling**: Properly handles nullable fields
- **Integer Validation**: Ensures numeric fields are integers

**Usage Examples**:
```typescript
// Validate user input before creating records
const userInput = {
    Contact_ID: "12345", // String input
    Contact_Date: "2024-01-15T10:30:00Z",
    Made_By: "1",
    Notes: "Follow-up call completed",
    Contact_Log_Type_ID: "1"
};

try {
    // Parse and validate input
    const validatedLog = ContactLogSchema.parse(userInput);
    // validatedLog now has proper types (numbers are converted from strings)
    
    const result = await mp.createTableRecords('Contact_Log', [validatedLog]);
    console.log('Contact log created successfully');
} catch (error) {
    if (error instanceof z.ZodError) {
        console.error('Validation errors:', error.errors);
        // Handle validation errors gracefully
    }
}

// Partial validation for updates
const ContactLogUpdateSchema = ContactLogSchema.partial();

const updateData = ContactLogUpdateSchema.parse({
    Contact_Log_ID: "67890",
    Notes: "Updated notes with additional information"
});
```

## Contact Log Types Entity

### ContactLogTypes Interface (`ContactLogTypes.ts`)

```typescript
export interface ContactLogTypesRecord {
  Contact_Log_Type_ID: number; // Primary Key
  Contact_Log_Type: string; // max 50 chars
  Description?: string | null; // max 500 chars
}

export type ContactLogTypes = ContactLogTypesRecord;
```

**Usage Examples**:
```typescript
// Get available contact log types
const logTypes = await mp.getTableRecords<ContactLogTypesRecord>('Contact_Log_Types', {
    $orderby: 'Contact_Log_Type'
});

// Display log type options
logTypes.forEach(type => {
    console.log(`${type.Contact_Log_Type_ID}: ${type.Contact_Log_Type}`);
    if (type.Description) {
        console.log(`  Description: ${type.Description}`);
    }
});

// Create contact log with specific type
const phoneCallLog: Partial<ContactLogRecord> = {
    Contact_ID: 12345,
    Contact_Date: new Date().toISOString(),
    Made_By: 1,
    Notes: 'Phone call to discuss small group participation',
    Contact_Log_Type_ID: logTypes.find(t => t.Contact_Log_Type === 'Phone Call')?.Contact_Log_Type_ID
};
```

### ContactLogTypesSchema (`ContactLogTypesSchema.ts`)

```typescript
import { z } from 'zod';

export const ContactLogTypesSchema = z.object({
  Contact_Log_Type_ID: z.number().int(),
  Contact_Log_Type: z.string().max(50),
  Description: z.string().max(500).nullable(),
});

export type ContactLogTypesInput = z.infer<typeof ContactLogTypesSchema>;
```

## Entity Usage Patterns

### Type-Safe CRUD Operations

```typescript
// Create with full type safety
const createContactLog = async (logData: Partial<ContactLogRecord>) => {
    // Validate input
    const validatedData = ContactLogSchema.partial().parse(logData);
    
    // Create record
    const result = await mp.createTableRecords<ContactLogRecord>('Contact_Log', [validatedData]);
    
    return result[0];
};

// Read with filtering
const getContactLogs = async (contactId: number, limit: number = 10) => {
    return await mp.getTableRecords<ContactLogRecord>('Contact_Log', {
        $filter: `Contact_ID=${contactId}`,
        $orderby: 'Contact_Date DESC',
        $top: limit,
        $select: 'Contact_Log_ID,Contact_Date,Notes,Contact_Log_Type_ID'
    });
};

// Update with validation
const updateContactLog = async (logId: number, updates: Partial<ContactLogRecord>) => {
    const validatedUpdates = ContactLogSchema.partial().parse({
        ...updates,
        Contact_Log_ID: logId
    });
    
    return await mp.updateTableRecords<ContactLogRecord>('Contact_Log', [validatedUpdates]);
};

// Delete
const deleteContactLog = async (logId: number) => {
    return await mp.deleteTableRecords<ContactLogRecord>('Contact_Log', [logId]);
};
```

### Form Integration

```typescript
// React form component with entity validation
import { ContactLogSchema } from '@/providers/MinistryPlatform/entities/ContactLogSchema';

const ContactLogForm = ({ contactId, onSubmit }) => {
    const [formData, setFormData] = useState({
        Contact_ID: contactId,
        Contact_Date: new Date().toISOString(),
        Made_By: 1,
        Notes: '',
        Contact_Log_Type_ID: null
    });
    
    const [errors, setErrors] = useState({});
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        try {
            // Validate form data
            const validatedData = ContactLogSchema.parse(formData);
            
            // Submit to API
            const result = await mp.createTableRecords('Contact_Log', [validatedData]);
            
            onSubmit(result[0]);
            setErrors({});
        } catch (error) {
            if (error instanceof z.ZodError) {
                // Convert Zod errors to form-friendly format
                const fieldErrors = {};
                error.errors.forEach(err => {
                    fieldErrors[err.path[0]] = err.message;
                });
                setErrors(fieldErrors);
            }
        }
    };
    
    return (
        <form onSubmit={handleSubmit}>
            <textarea
                value={formData.Notes}
                onChange={(e) => setFormData({...formData, Notes: e.target.value})}
                maxLength={2000}
                required
            />
            {errors.Notes && <span className="error">{errors.Notes}</span>}
            
            {/* Other form fields */}
            
            <button type="submit">Create Contact Log</button>
        </form>
    );
};
```

### Data Transformation

```typescript
// Transform between different data formats
const transformToDisplayFormat = (log: ContactLogRecord): DisplayContactLog => {
    return {
        id: log.Contact_Log_ID,
        contactId: log.Contact_ID,
        date: new Date(log.Contact_Date).toLocaleDateString(),
        time: new Date(log.Contact_Date).toLocaleTimeString(),
        notes: log.Notes,
        author: log.Made_By,
        successful: log.Contact_Successful ?? false,
        typeId: log.Contact_Log_Type_ID
    };
};

// Transform API response to internal format
const processContactLogs = (logs: ContactLogRecord[]): ProcessedLog[] => {
    return logs.map(log => ({
        ...log,
        parsedDate: new Date(log.Contact_Date),
        shortNotes: log.Notes.length > 100 ? log.Notes.substring(0, 100) + '...' : log.Notes,
        isRecent: Date.now() - new Date(log.Contact_Date).getTime() < 7 * 24 * 60 * 60 * 1000 // 7 days
    }));
};
```

## Entity Relationships

### Foreign Key Handling

```typescript
// Load contact log with related data
const getContactLogWithDetails = async (logId: number) => {
    // Get the contact log
    const [log] = await mp.getTableRecords<ContactLogRecord>('Contact_Log', {
        $filter: `Contact_Log_ID=${logId}`
    });
    
    // Get related contact information
    const [contact] = await mp.getTableRecords('Contacts', {
        $filter: `Contact_ID=${log.Contact_ID}`,
        $select: 'Contact_ID,Display_Name,Email_Address'
    });
    
    // Get log type information
    let logType = null;
    if (log.Contact_Log_Type_ID) {
        [logType] = await mp.getTableRecords<ContactLogTypesRecord>('Contact_Log_Types', {
            $filter: `Contact_Log_Type_ID=${log.Contact_Log_Type_ID}`
        });
    }
    
    // Get author information
    const [author] = await mp.getTableRecords('dp_Users', {
        $filter: `User_ID=${log.Made_By}`,
        $select: 'User_ID,Display_Name,Email_Address'
    });
    
    return {
        log,
        contact,
        logType,
        author
    };
};
```

### Bulk Operations with Validation

```typescript
// Process multiple contact logs with validation
const processBulkContactLogs = async (logsData: any[]) => {
    const validatedLogs: ContactLogRecord[] = [];
    const errors: any[] = [];
    
    // Validate each log entry
    for (let i = 0; i < logsData.length; i++) {
        try {
            const validatedLog = ContactLogSchema.parse(logsData[i]);
            validatedLogs.push(validatedLog);
        } catch (error) {
            errors.push({ index: i, error: error.errors });
        }
    }
    
    if (errors.length > 0) {
        throw new Error(`Validation failed for ${errors.length} records`);
    }
    
    // Create all valid logs
    return await mp.createTableRecords<ContactLogRecord>('Contact_Log', validatedLogs);
};
```

## Schema Evolution

### Handling Schema Changes

```typescript
// Support multiple schema versions
const ContactLogSchemaV1 = z.object({
    Contact_Log_ID: z.number().int(),
    Contact_ID: z.number().int(),
    Contact_Date: z.string().datetime(),
    Made_By: z.number().int(),
    Notes: z.string().max(1000), // Old limit
    // ... other fields
});

const ContactLogSchemaV2 = ContactLogSchemaV1.extend({
    Notes: z.string().max(2000), // Increased limit
    Contact_Successful: z.boolean().nullable(),
    // ... new fields
});

// Migration helper
const migrateContactLog = (oldLog: z.infer<typeof ContactLogSchemaV1>): z.infer<typeof ContactLogSchemaV2> => {
    return {
        ...oldLog,
        Contact_Successful: null // Default value for new field
    };
};
```

## Best Practices

### 1. Use Partial Types for Updates

```typescript
// Good: Use Partial for update operations
const updateData: Partial<ContactLogRecord> = {
    Contact_Log_ID: 123,
    Notes: 'Updated notes'
};

// Avoid: Full type for partial updates
const fullData: ContactLogRecord = {
    Contact_Log_ID: 123,
    Contact_ID: 456,
    Contact_Date: '2024-01-15T10:00:00Z',
    Made_By: 1,
    Notes: 'Updated notes',
    // ... all required fields
};
```

### 2. Validate Before Database Operations

```typescript
// Always validate input data
const createContactLog = async (input: unknown) => {
    const validatedInput = ContactLogSchema.parse(input);
    return await mp.createTableRecords('Contact_Log', [validatedInput]);
};
```

### 3. Handle Nullable Fields Properly

```typescript
// Check for null values before using optional fields
const formatContactLog = (log: ContactLogRecord) => {
    return {
        ...log,
        isSuccessful: log.Contact_Successful ?? false,
        hasType: log.Contact_Log_Type_ID !== null,
        typeDisplay: log.Contact_Log_Type_ID ? `Type ${log.Contact_Log_Type_ID}` : 'No Type'
    };
};
```

### 4. Use Type Guards for Runtime Checks

```typescript
// Type guard for contact log records
const isContactLogRecord = (obj: any): obj is ContactLogRecord => {
    return obj && 
           typeof obj.Contact_Log_ID === 'number' &&
           typeof obj.Contact_ID === 'number' &&
           typeof obj.Contact_Date === 'string' &&
           typeof obj.Made_By === 'number' &&
           typeof obj.Notes === 'string';
};

// Usage in API responses
const processApiResponse = (data: unknown) => {
    if (Array.isArray(data) && data.every(isContactLogRecord)) {
        // TypeScript now knows data is ContactLogRecord[]
        return data.map(log => formatContactLog(log));
    }
    throw new Error('Invalid contact log data received');
};
```

The entity system provides a robust foundation for type-safe database operations while ensuring data integrity through runtime validation. This approach reduces bugs, improves code quality, and provides excellent developer experience with full IntelliSense support.
