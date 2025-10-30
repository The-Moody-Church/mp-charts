/**
 * Example: Using Zod Validation with MPHelper
 * 
 * This demonstrates how to use the optional Zod schema validation
 * when creating or updating Ministry Platform records.
 */

import { MPHelper } from "../helper";
import { ContactLogSchema } from "../models/ContactLogSchema";
import { ContactLog } from "../models/ContactLog";

async function exampleWithValidation() {
  const mp = new MPHelper();

  // Example 1: Create records WITH validation
  // This will validate each record against ContactLogSchema before sending to API
  try {
    const validatedLogs = await mp.createTableRecords<ContactLog>(
      'Contact_Log',
      [
        {
          Contact_ID: 12345,
          Contact_Date: new Date().toISOString(),
          Made_By: 1,
          Notes: 'Valid contact log entry',
          Contact_Log_ID: 0, // Will be auto-generated
        }
      ],
      {
        schema: ContactLogSchema, // ✨ Enable Zod validation
        $userId: 1
      }
    );
    
    console.log('Created with validation:', validatedLogs);
  } catch (error) {
    console.error('Validation failed:', error);
    // Error will contain detailed field-level validation messages
  }

  // Example 2: Create records WITHOUT validation (backward compatible)
  // Validation is optional - if you don't provide schema, it works as before
  const unvalidatedLogs = await mp.createTableRecords<ContactLog>(
    'Contact_Log',
    [
      {
        Contact_ID: 12346,
        Contact_Date: new Date().toISOString(),
        Made_By: 1,
        Notes: 'Contact log without validation',
        Contact_Log_ID: 0,
      }
    ],
    {
      $userId: 1
      // No schema parameter = no validation
    }
  );

  // Example 3: Validation catches errors BEFORE API call
  // This will throw an error because Notes exceeds 2000 characters
  try {
    await mp.createTableRecords<ContactLog>(
      'Contact_Log',
      [
        {
          Contact_ID: 12347,
          Contact_Date: new Date().toISOString(),
          Made_By: 1,
          Notes: 'x'.repeat(2001), // ❌ Too long! (max 2000)
          Contact_Log_ID: 0,
        }
      ],
      {
        schema: ContactLogSchema,
        $userId: 1
      }
    );
  } catch (error) {
    console.error('Validation error:', error);
    // Output will show:
    // Zod validation failed for 1 record(s) in table 'Contact_Log':
    // Record #1:
    //   - Notes: String must contain at most 2000 character(s)
  }

  // Example 4: Multiple records, multiple errors
  try {
    await mp.createTableRecords<ContactLog>(
      'Contact_Log',
      [
        {
          // ❌ Missing required fields
          Contact_Log_ID: 0,
        } as any,
        {
          Contact_ID: 12348,
          Contact_Date: 'invalid-date', // ❌ Invalid datetime format
          Made_By: 1,
          Notes: 'Test',
          Contact_Log_ID: 0,
        }
      ],
      {
        schema: ContactLogSchema,
        $userId: 1
      }
    );
  } catch (error) {
    console.error('Multiple validation errors:', error);
    // Output will show errors for both records with field details
  }

  // Example 5: Update with validation
  await mp.updateTableRecords<ContactLog>(
    'Contact_Log',
    [
      {
        Contact_Log_ID: 67890,
        Contact_ID: 12345,
        Contact_Date: new Date().toISOString(),
        Made_By: 1,
        Notes: 'Updated with validation'
      }
    ],
    {
      schema: ContactLogSchema, // ✨ Validate before update
      $userId: 1
    }
  );
}

// Export for documentation purposes
export { exampleWithValidation };
