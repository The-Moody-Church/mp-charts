# Ministry Platform Type Generator

A CLI utility that generates TypeScript interfaces from your Ministry Platform database schema.

## Features

- **Column Metadata**: Generates precise TypeScript interfaces from Ministry Platform's column schema
- **Type Mapping**: Maps Ministry Platform data types to appropriate TypeScript types
- **Length Constraints**: Includes max length information for string fields with JSDoc comments
- **Type Annotations**: Rich type information (email, phone, URL, GUID, etc.)
- **Foreign Key Documentation**: Automatically documents foreign key relationships
- **Field Annotations**: Includes comments for primary keys, foreign keys, read-only, and computed fields
- **Access Level Info**: Documents table access levels and special permissions
- **Nullable Handling**: Properly handles required vs optional fields
- **Zod Schema Generation**: Optional runtime validation schemas with length and type constraints
- **Flexible Output**: Choose your output directory
- **Search Filtering**: Generate types for specific tables only
- **Auto-generated Index**: Creates barrel exports for easy importing
- **Environment Support**: Works with .env.local, .env.development, and .env files

## Installation

The utility uses `tsx` which is already installed as a dependency in this project.

### Environment Setup

Before using the CLI, ensure your environment contains the required Ministry Platform configuration:

```env
MINISTRY_PLATFORM_BASE_URL=https://your-domain.ministryplatformapi.com
MINISTRY_PLATFORM_CLIENT_ID=your_client_id
MINISTRY_PLATFORM_CLIENT_SECRET=your_client_secret
```

The CLI supports multiple environment files in Next.js order of precedence:
1. `.env.local` (highest priority, git-ignored by default)
2. `.env.development` 
3. `.env`

**Recommended Setup:**
```bash
# Create a local environment file (git-ignored)
cp .env.example .env.local
# Edit .env.local with your Ministry Platform credentials
```

This allows you to keep sensitive credentials in `.env.local` while maintaining example configurations in `.env.example`.

## Usage

### Basic Usage

```bash
# Generate basic types for all tables
npm run generate-types

# Or use tsx directly (recommended for advanced options)
npx tsx CLI/generate-types.ts
```

### Advanced Usage

**Note:** For commands with flags, use `npx tsx` directly as npm doesn't pass flags properly:

```bash
# Generate detailed types by sampling records
npx tsx CLI/generate-types.ts --detailed

# Generate types for specific tables
npx tsx CLI/generate-types.ts --search "Contact"

# Generate with Zod schemas for runtime validation
npx tsx CLI/generate-types.ts --zod

# Custom output directory
npx tsx CLI/generate-types.ts --output ./src/types/mp

# Detailed mode with custom sample size
npx tsx CLI/generate-types.ts --detailed --sample-size 10

# Combine options
npx tsx CLI/generate-types.ts --detailed --search "Contact" --output ./types --sample-size 5 --zod
```

## Command Line Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--output` | `-o` | Output directory for generated types | `./generated-types` |
| `--search` | `-s` | Filter tables by search term | (none) |
| `--detailed` | `-d` | Generate detailed types by sampling records | `false` |
| `--sample-size` | | Number of records to sample in detailed mode | `5` |
| `--zod` | `-z` | Generate Zod schemas for runtime validation | `false` |
| `--help` | `-h` | Show help message | |

## Output Structure

The utility generates:

```
generated-types/
├── index.ts              # Barrel export file
├── Contacts.ts           # Contact table interface & type
├── ContactsSchema.ts     # Contact Zod schema (if --zod used)
├── Households.ts         # Household table interface & type  
├── HouseholdsSchema.ts   # Household Zod schema (if --zod used)
└── ...                  # Additional table types
```

### Basic Mode Output Example

```typescript
/**
 * Interface for Contacts
 * Table: Contacts
 * Description: Contact information
 */
export interface ContactsRecord {
  Contacts_ID?: number; // Primary key (assuming standard naming convention)
  [key: string]: unknown; // Allow for additional fields
}

export type Contacts = ContactsRecord;
```

### Detailed Mode Output Example

```typescript
/**
 * Interface for Contacts
 * Table: Contacts
 * Access Level: ReadWriteAssignDelete
 * Special Permissions: FileAttach, DataExport, SecureRecord
 * Generated from column metadata
 */
export interface ContactsRecord {
  Contact_ID: number /* 32-bit integer */; // Primary Key
  Company: boolean;
  /**
   * Max length: 50 characters
   */
  Company_Name?: string /* max 50 chars */ | null;
  /**
   * Max length: 125 characters
   */
  Display_Name: string /* max 125 chars */;
  Prefix_ID?: number /* 32-bit integer */ | null; // Foreign Key -> Prefixes.Prefix_ID
  /**
   * Max length: 50 characters
   */
  First_Name?: string /* max 50 chars */ | null;
  /**
   * Max length: 50 characters
   */
  Middle_Name?: string /* max 50 chars */ | null;
  /**
   * Max length: 50 characters
   */
  Last_Name?: string /* max 50 chars */ | null;
  Date_of_Birth?: string /* ISO date (YYYY-MM-DD) */ | null;
  Gender_ID?: number /* 32-bit integer */ | null; // Foreign Key -> Genders.Gender_ID
  Contact_Status_ID: number /* 32-bit integer */; // Foreign Key -> Contact_Statuses.Contact_Status_ID, Has Default
  /**
   * Max length: 254 characters
   */
  Email_Address?: string /* email, max 254 chars */ | null;
  Mobile_Phone?: string /* phone number */ | null;
  Contact_GUID: string /* GUID/UUID */; // Has Default
  // ... 50+ additional fields with proper types, length constraints, and foreign key relationships
}

export type Contacts = ContactsRecord;
```

### Zod Schema Output Example

When using the `--zod` flag, additional schema files are generated:

```typescript
// ContactsSchema.ts
import { z } from 'zod';

export const ContactsSchema = z.object({
  Contact_ID: z.number().int(),
  Company: z.boolean(),
  Company_Name: z.string().max(50).nullable(),
  Display_Name: z.string().max(125),
  Prefix_ID: z.number().int().nullable(),
  First_Name: z.string().max(50).nullable(),
  Middle_Name: z.string().max(50).nullable(),
  Last_Name: z.string().max(50).nullable(),
  Date_of_Birth: z.string().datetime().nullable(),
  Gender_ID: z.number().int().nullable(),
  Contact_Status_ID: z.number().int(),
  Email_Address: z.string().email().max(254).nullable(),
  Mobile_Phone: z.string().nullable(),
  Contact_GUID: z.string().uuid(),
  // ... all other fields with proper validation
});

export type ContactsInput = z.infer<typeof ContactsSchema>;
```

## Using Generated Types

```typescript
// Import specific types
import { Contacts, Households } from './generated-types';
// Or import the record interfaces directly
import { ContactsRecord, HouseholdsRecord } from './generated-types';

// Import all types
import * as MPTypes from './generated-types';

// Use with MP Helper
const mpHelper = new MPHelper();

// Type-safe queries using the type alias
const contacts = await mpHelper.getTableRecords<Contacts>({
  table: 'Contacts',
  filter: 'Email_Address IS NOT NULL'
});

// Or using the record interface
const contactsRecords = await mpHelper.getTableRecords<ContactsRecord>({
  table: 'Contacts',
  filter: 'Email_Address IS NOT NULL'
});

// Create records with proper typing
const newContact: Contacts = {
  First_Name: 'John',
  Last_Name: 'Doe',
  Email_Address: 'john.doe@example.com',
  Display_Name: 'John Doe',
  Company: false
};

await mpHelper.createTableRecords('Contacts', [newContact]);

// With Zod validation (if schemas generated)
import { ContactsSchema } from './generated-types';

// Validate data at runtime
try {
  const validatedContact = ContactsSchema.parse(incomingContactData);
  await mpHelper.createTableRecords('Contacts', [validatedContact]);
} catch (error) {
  console.error('Validation failed:', error.errors);
}

// Partial validation for updates
const UpdateContactSchema = ContactsSchema.partial();
const validatedUpdate = UpdateContactSchema.parse(updateData);
```

## Performance Considerations

- **Basic Mode**: Fast, only fetches table metadata
- **Detailed Mode**: Slower, makes additional API calls to sample records
- **Large Schemas**: Use `--search` to limit scope for faster generation
- **Sample Size**: Lower sample sizes are faster but may miss field variations

## Error Handling

- If a table cannot be sampled in detailed mode, it falls back to basic mode
- Invalid table names are skipped with warnings
- API connection errors will terminate the process with error details

## Integration with Your Project

Add the generated types to your project's TypeScript configuration:

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/types/mp/*": ["./generated-types/*"]
    }
  }
}
```

## Automation

You can integrate this into your development workflow:

```json
// package.json
{
  "scripts": {
    "postinstall": "npm run generate-types",
    "dev": "npm run generate-types && next dev",
    "build": "npm run generate-types && next build"
  }
}
```
