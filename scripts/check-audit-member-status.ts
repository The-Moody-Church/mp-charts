#!/usr/bin/env tsx
/**
 * Diagnostic script: Query the dp_Audit_Log for Member_Status_ID changes
 * on specific Participant records to find when Associate Membership was set.
 *
 * Usage: npx tsx scripts/check-audit-member-status.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const envFiles = ['.env.local', '.env.development', '.env'];
envFiles.forEach(file => {
  const envPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
});

import { MPHelper } from '../src/lib/providers/ministry-platform';

// The 6 mismatched participants (have milestone but Date_Accomplished ≠ Date_Joined)
const PARTICIPANT_IDS = [124163, 125633, 127008, 127009, 147918, 159957];

async function main() {
  const mp = new MPHelper();

  // Try dp_Audit_Log — the standard MP audit table
  // It tracks field-level changes: Table_Name, Record_ID, Field_Name, Previous_Value, New_Value, Date_Time
  console.log('Querying dp_Audit_Log for Member_Status_ID changes on Participants table...\n');

  try {
    const auditRecords = await mp.getTableRecords<{
      Audit_Item_ID: number;
      Table_Name: string;
      Record_ID: number;
      Field_Name: string;
      Field_Label: string;
      Previous_Value: string | null;
      New_Value: string | null;
      Date_Time: string;
      User_Name: string | null;
    }>({
      table: 'dp_Audit_Log',
      select: 'Audit_Item_ID,Table_Name,Record_ID,Field_Name,Field_Label,Previous_Value,New_Value,Date_Time,User_Name',
      filter: `Table_Name = 'Participants' AND Field_Name = 'Member_Status_ID' AND Record_ID IN (${PARTICIPANT_IDS.join(',')})`,
    });

    if (auditRecords.length === 0) {
      console.log('No audit records found for dp_Audit_Log. Trying alternative table names...\n');
      throw new Error('empty');
    }

    console.log(`Found ${auditRecords.length} audit record(s):\n`);
    console.log('Participant_ID | Date/Time           | Previous_Value | New_Value | User');
    console.log('-'.repeat(90));
    for (const r of auditRecords) {
      const dt = r.Date_Time?.split('.')[0] ?? '(null)';
      console.log(
        `${String(r.Record_ID).padEnd(15)}| ${dt.padEnd(20)}| ${String(r.Previous_Value ?? '(null)').padEnd(15)}| ${String(r.New_Value ?? '(null)').padEnd(10)}| ${r.User_Name ?? '(unknown)'}`
      );
    }
  } catch {
    // Try alternative: maybe it's just "Audit_Log" or needs different column names
    console.log('Trying alternative audit table structures...\n');

    // Try querying with fewer columns to see what's available
    const tables = ['dp_Audit_Log', 'Audit_Log', 'dp_Audit_Detail'];
    for (const table of tables) {
      try {
        console.log(`Trying table: ${table}...`);
        const test = await mp.getTableRecords<Record<string, unknown>>({
          table,
          filter: `Record_ID IN (${PARTICIPANT_IDS.join(',')})`,
        });
        console.log(`  Found ${test.length} records. Sample:`, JSON.stringify(test[0], null, 2));
        break;
      } catch (err) {
        console.log(`  Table ${table} failed:`, (err as Error).message?.substring(0, 100));
      }
    }
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
